import { PlatformTest } from '@tsed/platform-http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from './ConfigService.js';
import { MqttTopicService } from './MqttTopicService.js';

const DEVICE_ID = 442;

describe('MqttTopicService', () => {
    let service: MqttTopicService;
    let configService: ConfigService;

    beforeEach(PlatformTest.create);
    beforeEach(() => {
        service = PlatformTest.get<MqttTopicService>(MqttTopicService);
        configService = PlatformTest.get<ConfigService>(ConfigService);
    });
    afterEach(PlatformTest.reset);
    afterEach(() => vi.restoreAllMocks());

    /** `config/test.json` has `mqtt.enabled: false` and no prefix, so topics are unprefixed. */
    describe('Without a topic prefix', () => {
        it('Should build the command subscription pattern', () => {
            expect(service.getCommandSubscriptionPattern()).toBe('miot-bridge/device/+/command');
        });

        it('Should build per-device topics', () => {
            expect(service.getCommandTopic(DEVICE_ID)).toBe('miot-bridge/device/442/command');
            expect(service.getResponseTopic(DEVICE_ID)).toBe('miot-bridge/device/442/response');
            expect(service.getNotificationsTopic(DEVICE_ID)).toBe('miot-bridge/device/442/notifications');
        });

        // These name spans. A template that accidentally interpolated the device id would give
        // Tempo one span name per device and quietly break every aggregate over them.
        it('Should build templates with the device id left as a placeholder', () => {
            expect(service.getCommandTopicTemplate()).toBe('miot-bridge/device/{deviceId}/command');
            expect(service.getResponseTopicTemplate()).toBe('miot-bridge/device/{deviceId}/response');
            expect(service.getNotificationsTopicTemplate()).toBe('miot-bridge/device/{deviceId}/notifications');
        });

        it('Should extract the device id back out of a command topic', () => {
            expect(service.extractDeviceIdFromCommandTopic('miot-bridge/device/442/command')).toBe(DEVICE_ID);
        });

        it('Should return null for a topic that is not a command topic', () => {
            expect(service.extractDeviceIdFromCommandTopic('miot-bridge/device/442/response')).toBeNull();
            expect(service.extractDeviceIdFromCommandTopic('other/device/442/command')).toBeNull();
            expect(service.extractDeviceIdFromCommandTopic('miot-bridge/device/abc/command')).toBeNull();
        });
    });

    describe('With a topic prefix', () => {
        beforeEach(() => {
            vi.spyOn(configService, 'config', 'get').mockReturnValue({
                ...configService.config,
                mqtt: { enabled: false, topicPrefix: 'home/office/' }
            } as typeof configService.config);
        });

        // The trailing slash is stripped, so a prefix written either way yields one topic.
        it('Should prefix concrete topics', () => {
            expect(service.getCommandTopic(DEVICE_ID)).toBe('home/office/miot-bridge/device/442/command');
        });

        it('Should prefix templates the same way', () => {
            expect(service.getCommandTopicTemplate()).toBe('home/office/miot-bridge/device/{deviceId}/command');
        });

        it('Should extract the device id from a prefixed topic', () => {
            expect(service.extractDeviceIdFromCommandTopic('home/office/miot-bridge/device/442/command')).toBe(
                DEVICE_ID
            );
        });

        it('Should return null for a topic missing the configured prefix', () => {
            expect(service.extractDeviceIdFromCommandTopic('miot-bridge/device/442/command')).toBeNull();
        });
    });
});
