import { describe, expect, it } from 'vitest';
import { parseDnsRecords } from './parseDns.js';
import type { AppConfig, DnsRecord } from '../types.js';

const baseConfig: AppConfig = {
    unifi: { host: 'https://192.168.1.1', apiKey: 'key' },
    serverPattern: '^server(\\d+)\\.home$',
    scheme: 'http'
};

const aRecord = (key: string, value: string, enabled = true): DnsRecord => ({
    key,
    value,
    record_type: 'A',
    enabled
});

const cnameRecord = (key: string, value: string): DnsRecord => ({
    key,
    value,
    record_type: 'CNAME',
    enabled: true
});

describe('parseDnsRecords', () => {
    it('returns empty array when no records provided', () => {
        expect(parseDnsRecords([], baseConfig)).toEqual([]);
    });

    it('groups services by server anchor via IP', () => {
        const records = [
            aRecord('server1.home', '192.168.1.10'),
            aRecord('app1.home', '192.168.1.10'),
            aRecord('app2.home', '192.168.1.10')
        ];
        const clusters = parseDnsRecords(records, baseConfig);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].label).toBe('server1');
        expect(clusters[0].services).toHaveLength(2);
    });

    it('groups services by server anchor via CNAME', () => {
        const records = [
            aRecord('server1.home', '192.168.1.10'),
            cnameRecord('service.home', 'server1.home')
        ];
        const clusters = parseDnsRecords(records, baseConfig);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].services[0].name).toBe('service');
    });

    it('excludes records listed in config.exclude', () => {
        const records = [
            aRecord('server1.home', '192.168.1.10'),
            aRecord('app.home', '192.168.1.10'),
            aRecord('dashboard.home', '192.168.1.10')
        ];
        const config = { ...baseConfig, exclude: ['dashboard.home'] };
        const clusters = parseDnsRecords(records, config);
        expect(clusters[0].services.map(s => s.hostname)).not.toContain('dashboard.home');
    });

    it('skips disabled records', () => {
        const records = [aRecord('server1.home', '192.168.1.10'), aRecord('app.home', '192.168.1.10', false)];
        const clusters = parseDnsRecords(records, baseConfig);
        expect(clusters).toHaveLength(0);
    });

    it('appends path suffixes from config.paths', () => {
        const records = [aRecord('server1.home', '192.168.1.10'), aRecord('traefik.home', '192.168.1.10')];
        const config = { ...baseConfig, paths: { traefik: '/dashboard' } };
        const clusters = parseDnsRecords(records, config);
        expect(clusters[0].services[0].url).toBe('http://traefik.home/dashboard');
    });

    it('falls back to subnet grouping when no anchor records match', () => {
        const records = [
            aRecord('app1.home', '10.0.0.1'),
            aRecord('app2.home', '10.0.0.2'),
            aRecord('other.home', '10.1.0.1')
        ];
        // No serverN.home records
        const clusters = parseDnsRecords(records, { ...baseConfig, serverPattern: '^NOMATCH$' });
        expect(clusters.length).toBeGreaterThan(0);
        expect(clusters.some(c => c.label.includes('10.0.0'))).toBe(true);
    });

    it('uses default server pattern when none provided', () => {
        const records = [
            aRecord('server1.home', '192.168.1.10'),
            aRecord('app.home', '192.168.1.10')
        ];
        const config: AppConfig = { unifi: { host: 'https://192.168.1.1', apiKey: 'key' } };
        const clusters = parseDnsRecords(records, config);
        expect(clusters).toHaveLength(1);
    });

    it('uses http scheme by default', () => {
        const records = [aRecord('server1.home', '192.168.1.10'), aRecord('app.home', '192.168.1.10')];
        const config: AppConfig = { unifi: { host: 'https://192.168.1.1', apiKey: 'key' } };
        const clusters = parseDnsRecords(records, config);
        expect(clusters[0].services[0].url).toMatch(/^http:\/\//);
    });

    it('assigns distinct accent colors to different servers', () => {
        const records = [
            aRecord('server1.home', '192.168.1.10'),
            aRecord('server2.home', '192.168.1.20'),
            aRecord('app1.home', '192.168.1.10'),
            aRecord('app2.home', '192.168.1.20')
        ];
        const clusters = parseDnsRecords(records, baseConfig);
        expect(clusters).toHaveLength(2);
        expect(clusters[0].color).not.toBe(clusters[1].color);
    });
});
