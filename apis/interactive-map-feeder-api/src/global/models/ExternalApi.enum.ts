/**
 * External APIs this service calls. Each value must have a matching entry under
 * `externalApis` in the configuration.
 */
export enum ExternalApi {
    /** ČHMÚ portal — static basemap layers (surface, cities, borders). */
    ChmiPortal = 'CHMI_PORTAL',
    /** ČHMÚ open data — the rolling precipitation radar composite. */
    ChmiOpendata = 'CHMI_OPENDATA'
}
