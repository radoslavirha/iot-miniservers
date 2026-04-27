import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams, Context, PathParams, QueryParams } from '@tsed/platform-params';
import { PlatformContext } from '@tsed/platform-http';
import { Delete, Description, Enum, Get, Maximum, Minimum, Post, Put, Required, Returns } from '@tsed/schema';
import { MAX_PNG_SIZE, MIN_PNG_SIZE } from '../constants.js';
import { Docs } from '@tsed/swagger';
import { QrCodeCreateHandler } from '../handlers/qr-codes/QrCodeCreateHandler.js';
import { QrCodeDeleteHandler } from '../handlers/qr-codes/QrCodeDeleteHandler.js';
import { QrCodeGetHandler } from '../handlers/qr-codes/QrCodeGetHandler.js';
import { QrCodeImageHandler } from '../handlers/qr-codes/QrCodeImageHandler.js';
import { QrCodeListHandler } from '../handlers/qr-codes/QrCodeListHandler.js';
import { QrCodeUpdateHandler } from '../handlers/qr-codes/QrCodeUpdateHandler.js';
import { QrCodeCreateRequest } from '../models/QrCodeCreateRequest.js';
import { QrCodeListResponse } from '../models/QrCodeListResponse.js';
import { QrCodeResponse } from '../models/QrCodeResponse.js';
import { QrCodeUpdateRequest } from '../models/QrCodeUpdateRequest.js';
import { QrErrorCorrection } from '../models/QrErrorCorrection.enum.js';
import { QrImageFormat } from '../models/QrImageFormat.enum.js';
import { QrType } from '../models/QrType.enum.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';

@Description('Endpoints for managing QR code mappings.')
@Controller({ path: '/qr-codes' })
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.API)
export class QrCodeController {
    constructor(
        private readonly createHandler: QrCodeCreateHandler,
        private readonly listHandler: QrCodeListHandler,
        private readonly getHandler: QrCodeGetHandler,
        private readonly updateHandler: QrCodeUpdateHandler,
        private readonly deleteHandler: QrCodeDeleteHandler,
        private readonly imageHandler: QrCodeImageHandler
    ) {}

    @Post('/')
    @Description('Allocates a new short slug and persists the mapping. Returns the created record with computed qrURL and imageURL.')
    @Returns(201, QrCodeResponse)
    public async create(
        @Required() @BodyParams(QrCodeCreateRequest) body: QrCodeCreateRequest
    ): Promise<QrCodeResponse> {
        return this.createHandler.execute(body);
    }

    @Get('/')
    @Description('Lists QR code mappings. Filter by type and active state via query parameters.')
    @Returns(200, QrCodeListResponse)
    public async list(
        @QueryParams('type') @Enum(QrType) type?: QrType,
        @QueryParams('active') active?: boolean
    ): Promise<QrCodeListResponse> {
        return this.listHandler.execute({ type, active });
    }

    @Get('/:id')
    @Description('Returns a single QR code mapping by its Mongo id.')
    @Returns(200, QrCodeResponse)
    public async get(
        @PathParams('id') id: string
    ): Promise<QrCodeResponse> {
        return this.getHandler.execute(id);
    }

    @Put('/:id')
    @Description('Updates a QR code mapping. All fields are optional; omitted fields are left unchanged.')
    @Returns(200, QrCodeResponse)
    public async update(
        @PathParams('id') id: string,
        @Required() @BodyParams(QrCodeUpdateRequest) body: QrCodeUpdateRequest
    ): Promise<QrCodeResponse> {
        return this.updateHandler.execute(id, body);
    }

    @Delete('/:id')
    @Description('Deletes a QR code mapping. The slug becomes available for reuse.')
    @Returns(204)
    public async delete(
        @PathParams('id') id: string
    ): Promise<void> {
        return this.deleteHandler.execute(id);
    }

    @Get('/:id/image')
    @Description('Returns the rendered QR image.\n\n- `format`: `svg` (default, vector) or `png` (raster).\n- `size`: PNG width in px (ignored for SVG). Range 64–4096.\n- `ecLevel`: error correction. `M` default (~15% damage tolerance, smallest). `L`/`Q`/`H` for less/more redundancy. Lower level = fewer modules = smaller print.')
    @(Returns(200).ContentType('image/png'))
    @(Returns(200).ContentType('image/svg+xml'))
    public async image(
        @PathParams('id') id: string,
        @Context() ctx: PlatformContext,
        @QueryParams('format') @Enum(QrImageFormat) format: QrImageFormat = QrImageFormat.SVG,
        @QueryParams('size') @Minimum(MIN_PNG_SIZE) @Maximum(MAX_PNG_SIZE) size?: number,
        @QueryParams('ecLevel') @Enum(QrErrorCorrection) ecLevel?: QrErrorCorrection
    ): Promise<void> {
        const image = await this.imageHandler.execute({ id, format, size, ecLevel });
        ctx.response
            .status(200)
            .contentType(image.contentType)
            .body(image.body);
    }
}
