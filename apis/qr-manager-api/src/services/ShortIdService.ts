import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { customAlphabet } from 'nanoid';
import { SLUG_ALPHABET, SLUG_LENGTH } from '../constants.js';

/**
 * Generates QR slugs. 4 chars × 36-symbol alphabet → ~1.68M space, plenty for the
 * expected hundreds of records and small enough to keep the printed QR physically
 * tiny. Slug uniqueness is enforced by the unique index on the Mongo collection;
 * callers retry on duplicate-key errors.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ShortIdService {
    private readonly generator = customAlphabet(SLUG_ALPHABET, SLUG_LENGTH);

    public generate(): string {
        return this.generator();
    }
}
