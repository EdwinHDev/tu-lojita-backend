-- Drop division frames columns from ranking_settings
ALTER TABLE "ranking_settings" DROP COLUMN IF EXISTS "divisionFrames";
ALTER TABLE "ranking_settings" DROP COLUMN IF EXISTS "division_frames";

