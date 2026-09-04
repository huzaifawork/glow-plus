import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  MAX_ADDRESS,
  MAX_CITY,
  MAX_LOGO_DATA_URL,
  MAX_POSTAL_CODE,
  MAX_REGION,
} from '../../common/limits';

/**
 * `PATCH /merchants/me/location`  (M1 — mobile spec R3.6-R3.10 dependency)
 *
 * The spec is explicit that distance-based discovery "requires every salon to
 * have a registered location on the platform". This is where a salon registers
 * it, and it is the salon's own portal that calls it — the app never writes
 * here, and never sends a customer's position anywhere (NF6).
 *
 * **Every field is optional, and `null` is meaningful.** A salon that entered
 * an address by mistake has to be able to take it back out, and the difference
 * between "leave this alone" (absent) and "clear it" (null) is the difference
 * between an editable field and a one-way door. `@ValidateIf` is what lets a
 * null through `@IsString()`, which would otherwise refuse it.
 *
 * Latitude and longitude arrive together or not at all — see the paired CHECK
 * constraint in the migration for why a half-set coordinate is worse than
 * none. Enforced here as well so the salon gets a 400 that says so rather than
 * a database error.
 */
export class UpdateLocationDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_ADDRESS)
  addressLine?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_CITY)
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_REGION)
  region?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_POSTAL_CODE)
  postalCode?: string | null;

  // `@Type(() => Number)` for the same reason the pagination DTOs need it: a
  // JSON body can carry a real number, but a form-encoded or string-typed
  // client sends "43.65", and `@IsLatitude` refuses a string that is a
  // perfectly good latitude.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;
}

/**
 * `PUT /merchants/me/logo`  (W2, W3)
 *
 * A base64 `data:` URL rather than a multipart upload. Three reasons, in order
 * of how much they cost to get wrong:
 *
 *   1. **The API runs on Vercel's serverless runtime.** Multipart needs a
 *      streaming body and a disk or object-storage sink; there is neither.
 *   2. **Both clients already hold the image as a data URL.** The website's
 *      file input reads it with `FileReader.readAsDataURL`, and Expo's image
 *      picker returns `base64` directly. Neither has to build a FormData.
 *   3. **It keeps the JSON error envelope.** A multipart route bypasses
 *      `ValidationPipe`, so W3's "clear error if the upload is rejected" would
 *      have to be re-implemented for this one route.
 *
 * The length bound here is the ONLY cheap check — it runs in the pipe, before
 * any decoding. The real validation (is it an image at all, is it within the
 * decoded size limit) is `decodeImageDataUrl` in `common/image.ts`, because
 * neither question can be answered by a decorator.
 */
export class UploadLogoDto {
  @IsString()
  @MaxLength(MAX_LOGO_DATA_URL, {
    message: 'That image is too large. The maximum logo size is 2 MB.',
  })
  image!: string;
}
