import { Controller, Scope, ProviderScope } from '@tsed/di';
import { PathParams, BodyParams } from '@tsed/platform-params';
import { Delete, Description, Get, Post, Required, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';
import { NotificationDeleteAllHandler } from '../handlers/notifications/NotificationDeleteAllHandler.js';
import { NotificationDeleteHandler } from '../handlers/notifications/NotificationDeleteHandler.js';
import { NotificationGetAllHandler } from '../handlers/notifications/NotificationGetAllHandler.js';
import { NotificationPostHandler } from '../handlers/notifications/NotificationPostHandler.js';
import { DeviceNotificationsResponse } from '../models/notifications/DeviceNotificationsResponse.js';
import { NotificationRequest } from '../models/notifications/NotificationRequest.js';

@Description('Endpoints for managing device property notification subscriptions.')
@Controller('/:deviceId/notifications')
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.DEVICES)
export class DeviceNotificationsController {
    constructor(
        private readonly notificationPostHandler: NotificationPostHandler,
        private readonly notificationGetAllHandler: NotificationGetAllHandler,
        private readonly notificationDeleteAllHandler: NotificationDeleteAllHandler,
        private readonly notificationDeleteHandler: NotificationDeleteHandler
    ) {}

    @Post('/')
    @Description('Creates notification subscriptions for specified device properties. Each property gets its own subscription record.')
    @Returns(201, DeviceNotificationsResponse)
    async create(
        @PathParams('deviceId') deviceId: string,
        @Required() @BodyParams(NotificationRequest) body: NotificationRequest
    ): Promise<DeviceNotificationsResponse> {
        return this.notificationPostHandler.execute(deviceId, body);
    }

    @Get('/')
    @Description('Returns all notification subscriptions for a device.')
    @Returns(200, DeviceNotificationsResponse)
    async getAll(
        @PathParams('deviceId') deviceId: string
    ): Promise<DeviceNotificationsResponse> {
        return this.notificationGetAllHandler.execute(deviceId);
    }

    @Delete('/')
    @Description('Deletes all notification subscriptions for a device.')
    @Returns(204)
    async deleteAll(
        @PathParams('deviceId') deviceId: string
    ): Promise<void> {
        return this.notificationDeleteAllHandler.execute(deviceId);
    }

    @Delete('/:notificationId')
    @Description('Deletes a specific notification subscription.')
    @Returns(204)
    async delete(
        @PathParams('deviceId') deviceId: string,
        @PathParams('notificationId') notificationId: string
    ): Promise<void> {
        return this.notificationDeleteHandler.execute(deviceId, notificationId);
    }
}
