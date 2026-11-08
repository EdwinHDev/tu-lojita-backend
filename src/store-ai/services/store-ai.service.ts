import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { Repository } from 'typeorm';
import { Store } from 'src/store/entities/store.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { CompanyActivityLogService } from 'src/company/services/company-activity-log.service';
import { ActivityLogModule } from 'src/company/entities/company-activity-log.entity';
import { CompanyPermission } from 'src/company/types/company-permission.enum';
import {
  StoreAiSettings,
  StoreSavedPrompt,
} from '../entities/store-ai-settings.entity';
import { AiKeyVaultService } from './ai-key-vault.service';
import { AiPromptPresetService } from './ai-prompt-preset.service';
import {
  EnhanceStoreImageDto,
  TestStoreAiKeyDto,
  UpdateStoreAiSettingsDto,
} from '../dto/store-ai.dto';

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_MINUTE = 5;
const GEMINI_TIMEOUT_MS = 45_000;

// PNG blanco 1x1 válido para prueba real de generación multimodal sin costo apreciable
const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

export const ECOMMERCE_FIDELITY_SYSTEM_INSTRUCTION = [
  'Eres un estudio fotográfico profesional de comercio electrónico.',
  'REGLAS ESTRICTAS E INMUTABLES DE FIDELIDAD:',
  '1. Trabaja EXCLUSIVAMENTE sobre el artículo o sujeto principal real presente en la fotografía proporcionada.',
  '2. Conserva intactos la forma, proporciones, textura real, etiquetas legibles, logotipos reales, costuras y detalles físicos del producto.',
  '3. PROHIBIDO inventar otro producto, añadir accesorios que no aparecen en la foto original, alterar marcas o disimular roturas/defectos físicos estructurales.',
  '4. Limítate a mejorar iluminación, nitidez, encuadre, centrado y limpieza/sustitución del fondo o superficie según la instrucción solicitada, devolviendo la fotografía mejorada.',
].join('\n');

function redactSecrets(text: string): string {
  if (!text) return '';
  return text.replace(/AIza[0-9A-Za-z_-]{8,}/g, '[REDACTED_API_KEY]');
}

@Injectable()
export class StoreAiService {
  private readonly logger = new Logger(StoreAiService.name);
  private readonly storeMinuteBuckets = new Map<string, number[]>();

  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreAiSettings)
    private readonly settingsRepo: Repository<StoreAiSettings>,
    private readonly vaultService: AiKeyVaultService,
    private readonly presetService: AiPromptPresetService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  private getTodayDateString(timezone = 'America/Caracas'): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  private computeEffectiveUsageToday(
    settings: StoreAiSettings | null | undefined,
    timezone?: string,
  ): { usageCountToday: number; todayStr: string } {
    const todayStr = this.getTodayDateString(timezone);
    if (!settings || settings.usageDate !== todayStr) {
      return { usageCountToday: 0, todayStr };
    }
    return { usageCountToday: settings.usageCountToday || 0, todayStr };
  }

  private async loadCompanyStore(storeId: string): Promise<Store> {
    const store = await this.storeRepo.findOne({
      where: { id: storeId },
      relations: ['company', 'company.owner', 'owner'],
    });

    if (!store || store.isDeleted) {
      throw new NotFoundException('Tienda no encontrada.');
    }

    if (!store.company?.id) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'COMPANY_REQUIRED',
        message:
          'El Estudio Fotográfico IA está disponible únicamente para sucursales pertenecientes a una empresa registrada.',
      });
    }

    return store;
  }

  private assertCompanyOwner(store: Store, actor: any): void {
    if (!actor || actor.isCollaborator || actor.actorType === 'COLLABORATOR') {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'OWNER_ONLY',
        message:
          'Solo el propietario titular de la empresa puede gestionar la API Key y la configuración de IA de la tienda.',
      });
    }

    const companyOwnerId = store.company?.owner?.id;
    const belongsToOwner = companyOwnerId
      ? companyOwnerId === actor.id
      : actor.company?.id === store.company?.id;

    if (!belongsToOwner) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'OWNER_ONLY',
        message: 'No eres el propietario titular de esta empresa.',
      });
    }
  }

  private assertAuthorizedOperator(store: Store, actor: any): void {
    if (!actor) {
      throw new ForbiddenException('No autorizado.');
    }

    if (actor.isCollaborator || actor.actorType === 'COLLABORATOR') {
      const sameCompany = actor.company?.id === store.company?.id;
      const permissions: string[] = Array.isArray(actor.permissions)
        ? actor.permissions
        : [];
      const hasInventoryEdit = permissions.includes(
        CompanyPermission.INVENTORY_EDIT,
      );
      const hasBranchAccess =
        actor.hasFullBranchAccess === true ||
        (Array.isArray(actor.allowedBranchIds) &&
          actor.allowedBranchIds.includes(store.id));
      const hasAiBranchPermission =
        Array.isArray(actor.aiAllowedStoreIds) &&
        actor.aiAllowedStoreIds.includes(store.id);

      if (
        !sameCompany ||
        !hasInventoryEdit ||
        !hasBranchAccess ||
        !hasAiBranchPermission
      ) {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          code: 'COLLABORATOR_AI_FORBIDDEN',
          message:
            'No tienes autorización activa para utilizar la mejora de imágenes con IA en esta sucursal.',
        });
      }
      return;
    }

    this.assertCompanyOwner(store, actor);
  }

  private enforceMinuteRateLimit(storeId: string): void {
    const now = Date.now();
    const bucket = (this.storeMinuteBuckets.get(storeId) || []).filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    );
    if (bucket.length >= RATE_LIMIT_MAX_PER_MINUTE) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'STORE_RATE_LIMITED',
          message:
            'Se alcanzó el límite temporal de generaciones por minuto en esta tienda. Espera unos segundos antes de volver a intentar.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.push(now);
    this.storeMinuteBuckets.set(storeId, bucket);
  }

  async getSettings(storeId: string, actor: any) {
    const store = await this.loadCompanyStore(storeId);
    this.assertCompanyOwner(store, actor);

    const [settings, globalEnabled, activeModel] = await Promise.all([
      this.settingsRepo.findOne({ where: { storeId: store.id } }),
      this.platformSettings.isAiImageEnhancementEnabled(),
      this.platformSettings.getAiGeminiModel(),
    ]);

    const dailyLimit = settings?.dailyLimit ?? 50;
    const { usageCountToday } = this.computeEffectiveUsageToday(
      settings,
      store.timezone,
    );

    return {
      storeId: store.id,
      globalEnabled,
      activeModel,
      isEnabled: Boolean(settings?.isEnabled && settings?.apiKeyHint),
      hasApiKey: Boolean(settings?.apiKeyHint),
      apiKeyHint: settings?.apiKeyHint ?? null,
      customPrompts: settings?.customPrompts ?? [],
      dailyLimit,
      usageCountToday,
      remainingDailyQuota: Math.max(0, dailyLimit - usageCountToday),
    };
  }

  async testKey(storeId: string, dto: TestStoreAiKeyDto, actor: any) {
    const store = await this.loadCompanyStore(storeId);
    this.assertCompanyOwner(store, actor);

    const globalEnabled =
      await this.platformSettings.isAiImageEnhancementEnabled();
    if (!globalEnabled) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'AI_IMAGE_GLOBALLY_DISABLED',
        message:
          'El sistema de mejora con IA ha sido desactivado temporalmente por la plataforma.',
      });
    }

    const trimmedKey = dto.apiKey.trim();
    const model = await this.platformSettings.getAiGeminiModel();

    await this.probeGeminiApiKey(trimmedKey, model);

    const apiKeyHint = this.vaultService.buildKeyHint(trimmedKey);

    if (dto.saveIfValid) {
      const encryptedApiKey = this.vaultService.encryptForStore(
        store.id,
        trimmedKey,
      );
      let existing = await this.settingsRepo.findOne({
        where: { storeId: store.id },
      });
      if (!existing) {
        existing = this.settingsRepo.create({
          storeId: store.id,
          isEnabled: true,
          encryptedApiKey,
          apiKeyHint,
          customPrompts: [],
          dailyLimit: 50,
          usageCountToday: 0,
        });
      } else {
        existing.encryptedApiKey = encryptedApiKey;
        existing.apiKeyHint = apiKeyHint;
        existing.isEnabled = true;
      }
      await this.settingsRepo.save(existing);

      await this.activityLogService.log({
        companyId: store.company!.id,
        storeId: store.id,
        actor,
        module: ActivityLogModule.STORE,
        action: 'STORE_AI_KEY_CONFIGURED',
        description: `API Key de Gemini validada y configurada para la sucursal ${store.branchName || store.name}`,
        metadata: { apiKeyHint },
      });

      return {
        valid: true,
        saved: true,
        apiKeyHint,
        settings: await this.getSettings(store.id, actor),
      };
    }

    return {
      valid: true,
      saved: false,
      apiKeyHint,
    };
  }

  async updateSettings(
    storeId: string,
    dto: UpdateStoreAiSettingsDto,
    actor: any,
  ) {
    const store = await this.loadCompanyStore(storeId);
    this.assertCompanyOwner(store, actor);

    if (dto.customPrompts && dto.customPrompts.length > 3) {
      throw new BadRequestException(
        'Solo puedes guardar un máximo de 3 prompts propios por tienda.',
      );
    }

    let settings = await this.settingsRepo.findOne({
      where: { storeId: store.id },
    });

    if (!settings) {
      settings = this.settingsRepo.create({
        storeId: store.id,
        isEnabled: false,
        apiKeyHint: null,
        customPrompts: [],
        dailyLimit: 50,
        usageCountToday: 0,
      });
    }

    if (dto.apiKey !== undefined) {
      const trimmedKey = dto.apiKey.trim();
      const model = await this.platformSettings.getAiGeminiModel();
      await this.probeGeminiApiKey(trimmedKey, model);
      settings.encryptedApiKey = this.vaultService.encryptForStore(
        store.id,
        trimmedKey,
      );
      settings.apiKeyHint = this.vaultService.buildKeyHint(trimmedKey);
    }

    if (dto.isEnabled === true) {
      const globalEnabled =
        await this.platformSettings.isAiImageEnhancementEnabled();
      if (!globalEnabled) {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          code: 'AI_IMAGE_GLOBALLY_DISABLED',
          message:
            'El sistema de mejora con IA ha sido desactivado temporalmente por la plataforma.',
        });
      }

      if (!settings.apiKeyHint) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'API_KEY_REQUIRED',
          message:
            'Debes configurar y validar una API Key de Gemini antes de activar la mejora de imágenes en esta tienda.',
        });
      }
    }

    if (dto.isEnabled !== undefined) {
      settings.isEnabled = dto.isEnabled;
    }

    if (dto.dailyLimit !== undefined) {
      settings.dailyLimit = dto.dailyLimit;
    }

    if (dto.customPrompts !== undefined) {
      const normalizedPrompts: StoreSavedPrompt[] = dto.customPrompts.map(
        (item) => ({
          id: item.id?.trim() || crypto.randomUUID(),
          title: item.title.trim(),
          prompt: item.prompt.trim(),
        }),
      );
      settings.customPrompts = normalizedPrompts;
    }

    await this.settingsRepo.save(settings);

    await this.activityLogService.log({
      companyId: store.company!.id,
      storeId: store.id,
      actor,
      module: ActivityLogModule.STORE,
      action: 'STORE_AI_SETTINGS_UPDATED',
      description: `Configuración de Estudio IA actualizada en ${store.branchName || store.name}`,
      metadata: {
        isEnabled: settings.isEnabled,
        dailyLimit: settings.dailyLimit,
        customPromptsCount: settings.customPrompts?.length ?? 0,
      },
    });

    return this.getSettings(store.id, actor);
  }

  async deleteKey(storeId: string, actor: any) {
    const store = await this.loadCompanyStore(storeId);
    this.assertCompanyOwner(store, actor);

    const existing = await this.settingsRepo.findOne({
      where: { storeId: store.id },
    });

    if (existing) {
      existing.encryptedApiKey = null;
      existing.apiKeyHint = null;
      existing.isEnabled = false;
      await this.settingsRepo.save(existing);

      await this.activityLogService.log({
        companyId: store.company!.id,
        storeId: store.id,
        actor,
        module: ActivityLogModule.STORE,
        action: 'STORE_AI_KEY_REMOVED',
        description: `Credencial de Gemini eliminada en la sucursal ${store.branchName || store.name}`,
      });
    }

    return this.getSettings(store.id, actor);
  }

  async getCatalog(storeId: string, actor: any) {
    const store = await this.loadCompanyStore(storeId);
    this.assertAuthorizedOperator(store, actor);

    const [globalEnabled, settings, officialPresets] = await Promise.all([
      this.platformSettings.isAiImageEnhancementEnabled(),
      this.settingsRepo.findOne({ where: { storeId: store.id } }),
      this.presetService.findActive(),
    ]);

    const storeEnabled = Boolean(settings?.isEnabled && settings?.apiKeyHint);
    const dailyLimit = settings?.dailyLimit ?? 50;
    const { usageCountToday } = this.computeEffectiveUsageToday(
      settings,
      store.timezone,
    );

    return {
      storeId: store.id,
      available: globalEnabled && storeEnabled,
      globalEnabled,
      storeEnabled,
      officialPresets: officialPresets.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        prompt: p.prompt,
      })),
      storePrompts: storeEnabled ? (settings?.customPrompts ?? []) : [],
      dailyLimit,
      remainingDailyQuota: Math.max(0, dailyLimit - usageCountToday),
    };
  }

  async enhanceImage(
    storeId: string,
    file: UploadedImageFile | undefined,
    dto: EnhanceStoreImageDto,
    actor: any,
  ) {
    const globalEnabled =
      await this.platformSettings.isAiImageEnhancementEnabled();
    if (!globalEnabled) {
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'GLOBAL_AI_DISABLED',
        message:
          'El servicio de mejora de imágenes con IA está desactivado temporalmente por el administrador de la plataforma.',
      });
    }

    const store = await this.loadCompanyStore(storeId);
    this.assertAuthorizedOperator(store, actor);

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'IMAGE_REQUIRED',
        message:
          'Debes adjuntar una fotografía real del artículo o servicio para mejorarla con IA.',
      });
    }

    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        'La imagen supera el tamaño máximo permitido de 8 MB.',
      );
    }

    const normalizedMime = (file.mimetype || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      throw new BadRequestException(
        'Formato de imagen no soportado. Utiliza archivos JPEG, PNG o WEBP.',
      );
    }
    const geminiInputMime =
      normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime;

    const settings = await this.settingsRepo
      .createQueryBuilder('s')
      .addSelect('s.encryptedApiKey')
      .where('s.storeId = :storeId', { storeId: store.id })
      .getOne();

    if (!settings || !settings.isEnabled || !settings.encryptedApiKey) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'STORE_AI_DISABLED',
        message:
          'El Estudio Fotográfico IA no se encuentra activo o configurado en esta sucursal.',
      });
    }

    const { finalPrompt, promptSource } = await this.resolveEnhancementPrompt(
      dto,
      settings.customPrompts || [],
    );

    const { usageCountToday, todayStr } = this.computeEffectiveUsageToday(
      settings,
      store.timezone,
    );
    if (usageCountToday >= settings.dailyLimit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'STORE_DAILY_QUOTA_EXCEEDED',
          message: `Esta sucursal alcanzó su límite diario configurado (${settings.dailyLimit} imágenes por día).`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.enforceMinuteRateLimit(store.id);

    const decryptedApiKey = this.vaultService.decryptForStore(
      store.id,
      settings.encryptedApiKey,
    );
    const model = await this.platformSettings.getAiGeminiModel();

    const generated = await this.invokeGeminiGenerateImage(
      decryptedApiKey,
      model,
      geminiInputMime,
      file.buffer.toString('base64'),
      finalPrompt,
    );

    const nextUsageCount = usageCountToday + 1;
    await this.settingsRepo.update(
      { storeId: store.id },
      {
        usageCountToday: nextUsageCount,
        usageDate: todayStr,
      },
    );

    await this.activityLogService.log({
      companyId: store.company!.id,
      storeId: store.id,
      actor,
      module: ActivityLogModule.INVENTORY,
      action: 'AI_IMAGE_ENHANCED',
      description: `Fotografía de catálogo mejorada con IA (${promptSource}) en ${store.branchName || store.name}`,
      metadata: {
        promptSource,
        presetId: dto.presetId ?? null,
        storePromptId: dto.storePromptId ?? null,
        model,
      },
    });

    return {
      mimeType: generated.mimeType,
      imageBase64: generated.imageBase64,
      remainingDailyQuota: Math.max(0, settings.dailyLimit - nextUsageCount),
    };
  }

  private async resolveEnhancementPrompt(
    dto: EnhanceStoreImageDto,
    storePrompts: StoreSavedPrompt[],
  ): Promise<{ finalPrompt: string; promptSource: string }> {
    const segments: string[] = [];
    let promptSource = 'CUSTOM';

    if (dto.presetId) {
      const preset = await this.presetService.findActiveById(dto.presetId);
      segments.push(preset.prompt);
      promptSource = `OFFICIAL_PRESET:${preset.title}`;
    } else if (dto.storePromptId) {
      const found = storePrompts.find((p) => p.id === dto.storePromptId);
      if (!found) {
        throw new NotFoundException(
          'El prompt guardado de la tienda no fue encontrado.',
        );
      }
      segments.push(found.prompt);
      promptSource = `STORE_PROMPT:${found.title}`;
    }

    if (dto.customPrompt?.trim()) {
      segments.push(dto.customPrompt.trim());
      if (segments.length > 1) {
        promptSource = `${promptSource}+CUSTOM`;
      }
    }

    if (segments.length === 0) {
      throw new BadRequestException(
        'Debes seleccionar un preset o escribir una instrucción para mejorar la imagen.',
      );
    }

    return {
      finalPrompt: segments.join('\nInstrucción adicional: '),
      promptSource,
    };
  }

  private async probeGeminiApiKey(
    rawApiKey: string,
    model: string,
  ): Promise<void> {
    await this.invokeGeminiGenerateImage(
      rawApiKey,
      model,
      'image/png',
      ONE_BY_ONE_PNG_BASE64,
      'Conserva este recuadro blanco limpio.',
      true,
    );
  }

  private async invokeGeminiGenerateImage(
    rawApiKey: string,
    model: string,
    mimeType: string,
    imageBase64: string,
    userPrompt: string,
    isKeyProbe = false,
  ): Promise<{ mimeType: string; imageBase64: string }> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': rawApiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: ECOMMERCE_FIDELITY_SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
                {
                  text: userPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (err: any) {
      const safeMsg = redactSecrets(err?.message || 'Error de red');
      this.logger.warn(
        `Fallo de conexión hacia Gemini (modelo=${model}): ${safeMsg}`,
      );
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new GatewayTimeoutException({
          statusCode: HttpStatus.GATEWAY_TIMEOUT,
          code: 'GEMINI_TIMEOUT',
          message:
            'El servicio de Google Gemini tardó demasiado en responder. Intenta nuevamente.',
        });
      }
      throw new BadGatewayException({
        statusCode: HttpStatus.BAD_GATEWAY,
        code: 'GEMINI_NETWORK_ERROR',
        message:
          'No se pudo establecer comunicación con Google Gemini en este momento.',
      });
    }

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      this.throwMappedGeminiHttpError(response.status, payload, model);
    }

    if (isKeyProbe) {
      return { mimeType: 'image/png', imageBase64: ONE_BY_ONE_PNG_BASE64 };
    }

    const parts: any[] = payload?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      const data = inline?.data;
      const outMime = inline?.mimeType || inline?.mime_type || 'image/png';
      if (typeof data === 'string' && data.length > 0) {
        return {
          mimeType: outMime,
          imageBase64: data,
        };
      }
    }

    const blockReason =
      payload?.promptFeedback?.blockReason ||
      payload?.candidates?.[0]?.finishReason;

    this.logger.warn(
      `Gemini respondió sin bloque de imagen (finishReason=${blockReason || 'UNKNOWN'}, model=${model})`,
    );

    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'NO_IMAGE_GENERATED',
      message:
        'La IA no pudo generar una versión mejorada con esa instrucción. Intenta describir el ajuste visual de forma más clara.',
    });
  }

  private throwMappedGeminiHttpError(
    status: number,
    payload: any,
    model: string,
  ): never {
    const rawDetail = redactSecrets(
      String(payload?.error?.message || payload?.error?.status || ''),
    );
    const upperDetail = rawDetail.toUpperCase();

    if (
      status === 401 ||
      status === 403 ||
      (status === 400 &&
        (upperDetail.includes('API_KEY') ||
          upperDetail.includes('API KEY') ||
          upperDetail.includes('INVALID_ARGUMENT') &&
            upperDetail.includes('KEY')))
    ) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'INVALID_API_KEY',
        message:
          'La API Key de Google Gemini no es válida, fue revocada o no tiene permisos para usar Generative Language API.',
      });
    }

    if (status === 429 || upperDetail.includes('RESOURCE_EXHAUSTED')) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'QUOTA_OR_BILLING_REQUIRED',
          message:
            'Tu API Key es reconocida por Google, pero agotó su cuota o requiere habilitar facturación (Tier 1) en Google AI Studio para procesar imágenes.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (status === 404) {
      this.logger.error(`Modelo Gemini no encontrado: ${model}`);
      throw new BadGatewayException({
        statusCode: HttpStatus.BAD_GATEWAY,
        code: 'MODEL_UNAVAILABLE',
        message: `El modelo configurado (${model}) no está disponible en Google Gemini.`,
      });
    }

    this.logger.warn(
      `Error HTTP ${status} devuelto por Gemini (model=${model}): ${rawDetail.slice(0, 180)}`,
    );

    throw new BadGatewayException({
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'GEMINI_UPSTREAM_ERROR',
      message:
        'Google Gemini rechazó temporalmente la solicitud de mejora de imagen. Verifica tu cuenta o intenta nuevamente.',
    });
  }
}
