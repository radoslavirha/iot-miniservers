import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams, PathParams, QueryParams } from '@tsed/platform-params';
import { Delete, Description, Get, Optional, Post, Required, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { ModelPropertyOverrideCreateHandler } from '../handlers/model-property-overrides/ModelPropertyOverrideCreateHandler.js';
import { ModelPropertyOverrideDeleteHandler } from '../handlers/model-property-overrides/ModelPropertyOverrideDeleteHandler.js';
import { ModelPropertyOverrideGetAllHandler } from '../handlers/model-property-overrides/ModelPropertyOverrideGetAllHandler.js';
import { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverrideRequest } from '../models/model-property-override/ModelPropertyOverrideRequest.js';
import { ModelPropertyOverridesResponse } from '../models/model-property-override/ModelPropertyOverridesResponse.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';

@Description('Endpoints for managing custom (undocumented) property value overrides per device model.')
@Controller('/model-property-overrides')
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.API)
export class ModelPropertyOverridesController {
    constructor(
        private readonly getAllHandler: ModelPropertyOverrideGetAllHandler,
        private readonly createHandler: ModelPropertyOverrideCreateHandler,
        private readonly deleteHandler: ModelPropertyOverrideDeleteHandler
    ) {}

    @Get('/')
    @Description('Returns all model property overrides, optionally filtered by model.')
    @Returns(200, ModelPropertyOverridesResponse)
    public async getAllOverrides(
        @Optional() @QueryParams('model') model?: string
    ): Promise<ModelPropertyOverridesResponse> {
        return this.getAllHandler.execute(model);
    }

    @Post('/')
    @Description('Creates a new model property override, adding custom values to a property spec.')
    @Returns(201, ModelPropertyOverride)
    public async createOverride(
        @Required() @BodyParams(ModelPropertyOverrideRequest) body: ModelPropertyOverrideRequest
    ): Promise<ModelPropertyOverride> {
        return this.createHandler.execute(body);
    }

    @Delete('/:id')
    @Description('Deletes a model property override by ID.')
    @Returns(204)
    public async deleteOverride(
        @PathParams('id') id: string
    ): Promise<void> {
        return this.deleteHandler.execute(id);
    }
}
