import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { Injectable, ProviderScope, Scope } from '@tsed/di';
import { DataSources } from '../DataSources.js';
import { DataSourcesResponse } from '../models/DataSourcesResponse.js';

@Injectable()
@Scope(ProviderScope.REQUEST)
export class DataSourcesListHandler {
    constructor() {}

    public async execute(): Promise<DataSourcesResponse> {
        return CommonUtils.buildModelStrict(DataSourcesResponse, {
            dataSources: ObjectUtils.values(DataSources)
        });
    }
}