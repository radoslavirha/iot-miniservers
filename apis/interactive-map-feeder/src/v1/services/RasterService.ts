import { ProviderScope, Scope, Service } from '@tsed/di';
import { CommonUtils, GeoUtils, NumberUtils } from '@radoslavirha/utils';
import Sharp from 'sharp';
import { BBox, Position, RGBA } from '../models/index.js';
import { CITIES } from '../cities.js';

@Service()
@Scope(ProviderScope.SINGLETON)
export class RasterService {
    public createImage(buffer: Buffer, options?: Sharp.SharpOptions): Sharp.Sharp {
        return Sharp(buffer, options);
    }

    public async compositeImages(base: Sharp.Sharp, images: Buffer[]): Promise<Sharp.Sharp> {
        return await base.composite(images.map(image => ({ input: image })));
    }

    public async getRGBAOnCoordinates(latitude: number, longitude: number, bbox: BBox, image: Sharp.Sharp, radiusInKm: number = 2.5): Promise<RGBA>{
        const metadata = await image.metadata();
        const position = this.getPositionOnImage(latitude, longitude, bbox, metadata.height!, metadata.width!);
        
        const pixels = await this.getPixelsWithRadius(
            position,
            image,
            this.calculatePixelFromKilometers(radiusInKm, bbox, metadata.height!, metadata.width!)
        );

        return new RGBA(
            NumberUtils.round(NumberUtils.mean(pixels.map(p => p.r))),
            NumberUtils.round(NumberUtils.mean(pixels.map(p => p.g))),
            NumberUtils.round(NumberUtils.mean(pixels.map(p => p.b))),
            NumberUtils.round(NumberUtils.mean(pixels.map(p => p.a)))
        );
    };

    public async createCitiesImage(height: number, width: number, bbox: BBox): Promise<Buffer> {
        const channels = 4; // RGBA format
        const buffer = Buffer.alloc(width * height * channels, 0); // Initialize with black (RGBA)

        const cities = CommonUtils.cloneDeep(CITIES);
        
        const offset = this.getCityPixelOffset(height, width);

        for (const city of cities) {
            const position = this.getPositionOnImage(city.latitude, city.longitude, bbox, height, width);
            for (let dx = -offset; dx <= offset; dx++) {
                for (let dy = -offset; dy <= offset; dy++) {
                    const x = position.x + dx;
                    const y = position.y + dy;
                    if (x >= 0 && x < width && y >= 0 && y < height) {
                        const index = (y * width + x) * channels;
                        buffer[index] = 255;     // Red
                        buffer[index + 1] = 0;   // Green
                        buffer[index + 2] = 0;   // Blue
                        buffer[index + 3] = 255; // Alpha
                    }
                }
            }
        }

        return await this.createImage(buffer, { raw: { width, height, channels } })
            .png()
            .toBuffer();
    }

    /**
     * Calculates the dot size based on the image size and returns the offset from the center of the dot.
     */
    private getCityPixelOffset(height: number, width: number): number {
        const percentOfValue = 0.25;
        const lower =  NumberUtils.min([height, width]);
        const dotWidth = NumberUtils.round(NumberUtils.getValueFromPercent(lower, percentOfValue));
        if (dotWidth % 2 === 0) {
            return dotWidth / 2;
        } else {
            return (dotWidth - 1) / 2;
        }
    }

    private getPositionOnImage(latitude: number, longitude: number, bbox: BBox, imageHeight: number, imageWidth: number): Position {
        const longitudeDiff = bbox.bottomRight.longitude - bbox.topLeft.longitude,
            latitudeDiff = bbox.topLeft.latitude - bbox.bottomRight.latitude,
            fromLeft = NumberUtils.getPercentFromValue(longitudeDiff, longitude - bbox.topLeft.longitude),
            fromTop = NumberUtils.getPercentFromValue(latitudeDiff, bbox.topLeft.latitude - latitude);

        return CommonUtils.buildModel(Position, {
            x: NumberUtils.round(NumberUtils.getValueFromPercent(imageWidth, fromLeft)),
            y: NumberUtils.round(NumberUtils.getValueFromPercent(imageHeight, fromTop))
        });
    }

    private async getPixelsWithRadius(position: Position, image: Sharp.Sharp, radius = 0): Promise<RGBA[]> {
        const { data, info } = await image
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { width, height, channels } = info;
        const { x, y } = position;

        const startX = NumberUtils.max([0, x - radius]);
        const endX = NumberUtils.min([width - 1, x + radius]);
        const startY = NumberUtils.max([0, y - radius]);
        const endY = NumberUtils.min([height - 1, y + radius]);

        const pixels: RGBA[] = [];

        for (let j = startY; j <= endY; j++) {
            for (let i = startX; i <= endX; i++) {
                const srcIndex = (j * width + i) * channels;
                if (channels === 4) {
                    pixels.push(new RGBA(data[srcIndex], data[srcIndex + 1], data[srcIndex + 2], data[srcIndex + 3]));
                } else {
                    throw new Error('Only 4 channels are supported');
                }
            }
        }

        return pixels;
    };

    /**
     * Calculates the number of pixels corresponding to a given distance in kilometers.
     */
    private calculatePixelFromKilometers(kilometers: number, bbox: BBox, imageHeight: number, imageWidth: number): number {
        const bboxWidthKm = GeoUtils.calculateKmBetweenCoordinates(bbox.topLeft.latitude, bbox.topLeft.longitude, bbox.topLeft.latitude, bbox.bottomRight.longitude);
        const bboxHeightKm = GeoUtils.calculateKmBetweenCoordinates(bbox.topLeft.latitude, bbox.topLeft.longitude, bbox.bottomRight.latitude, bbox.topLeft.longitude);

        const xResolution = imageWidth / bboxWidthKm; // pixels per kilometer
        const yResolution = imageHeight / bboxHeightKm; // pixels per kilometer
        
        const averageResolution = (xResolution + yResolution) / 2;

        return NumberUtils.round(kilometers * averageResolution);
    }
}
