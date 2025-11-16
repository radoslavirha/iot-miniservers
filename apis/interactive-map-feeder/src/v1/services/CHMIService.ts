import axios from 'axios';

export abstract class CHMIService {
    // https://opendata.chmi.cz/meteorology/weather/radar/radar_popis_cz.pdf

    public async getSurfaceMap(): Promise<Buffer> {
        const url = `https://www.chmi.cz/files/portal/docs/meteo/rad/inca-cz/und/pacz2gmaps6.oro_col_40med.jpg`;
        const response = await axios<Buffer>({ method: 'GET', url, responseType: 'arraybuffer' });
        return response.data;
    }

    public async getCitiesMap(): Promise<Buffer> {
        const url = `https://www.chmi.cz/files/portal/docs/meteo/rad/inca-cz/und/pacz2gmaps6.und2.png`;
        const response = await axios<Buffer>({ method: 'GET', url, responseType: 'arraybuffer' });
        return response.data;
    }

    public async getBordersMap(): Promise<Buffer> {
        const url = `https://www.chmi.cz/files/portal/docs/meteo/rad/inca-cz/und/pacz2gmaps6.borders5.und.png`;
        const response = await axios<Buffer>({ method: 'GET', url, responseType: 'arraybuffer' });
        return response.data;
    }

    protected abstract getCurrentDate(): string;
}