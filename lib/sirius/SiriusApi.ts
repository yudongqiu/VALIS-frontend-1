/**
 * Temporary API for development 
 */
import axios, { AxiosRequestConfig, CancelToken } from 'axios';

import { TileContent } from './AnnotationTileset';

export class SiriusApi {

    public static apiUrl: string = '';

    private static minMaxCache: {
        [path: string]: Promise<{ min: number, max: number }>
    } = {};
    private static suggestionsCache: {
        [key: string]: Array<any>
    } = {};

    static loadAnnotations(
        contig: string,
        macro: boolean,
        startBaseIndex: number,
        span: number,
    ): Promise<TileContent> {
        let jsonPath = `https://valis-tmp-data.firebaseapp.com/data/annotation/${contig}${macro ? '-macro' : ''}/${startBaseIndex},${span}.json`;
        return axios.get(jsonPath).then((a) => {
            return a.data;
        });
    }

    static loadACGTSubSequence(
        contig: string,
        lodLevel: number,
        lodStartBaseIndex: number,
        lodSpan: number,
    ): Promise<{
        array: Uint8Array,
        sequenceMinMax: {
            min: number,
            max: number,
        },
        indicesPerBase: number,
    }> {
        let samplingDensity = (1 << lodLevel);
        let startBasePair = samplingDensity * lodStartBaseIndex + 1;
        let spanBasePair = lodSpan * samplingDensity;
        let endBasePair = startBasePair + spanBasePair - 1;
        let url = `${this.apiUrl}/datatracks/sequence/${contig}/${startBasePair}/${endBasePair}?sampling_rate=${samplingDensity}`;

        return axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            headers: {},
        }).then((a) => {
            let payloadArray = new Float32Array(this.parseSiriusBinaryResponse(a.data));
            let baseCount = payloadArray.length / 4;

            if (baseCount > lodSpan) {
                console.warn(`Payload too large, expected ${lodSpan} units but received ${baseCount} units`);
            }

            // build compressed array
            let compressedArray = new Uint8Array(payloadArray.length);
            // find min/max
            let min = Infinity;
            let max = -Infinity;
            for (let i = 0; i < baseCount; i++) {
                let v0 = payloadArray[i * 4 + 0];
                let v1 = payloadArray[i * 4 + 1];
                let v2 = payloadArray[i * 4 + 2];
                let v3 = payloadArray[i * 4 + 3];
                min = Math.min(min, v0);
                min = Math.min(min, v1);
                min = Math.min(min, v2);
                min = Math.min(min, v3);
                max = Math.max(max, v0);
                max = Math.max(max, v1);
                max = Math.max(max, v2);
                max = Math.max(max, v3);
            }

            // use min/max to compress floats to bytes
            let delta = max - min;
            let scaleFactor = delta === 0 ? 0 : (1/delta);
            for (let i = 0; i < baseCount; i++) {
                compressedArray[i * 4 + 0] = Math.round(Math.min((payloadArray[i * 4 + 0] - min) * scaleFactor, 1.) * 0xFF); // A
                compressedArray[i * 4 + 1] = Math.round(Math.min((payloadArray[i * 4 + 3] - min) * scaleFactor, 1.) * 0xFF); // C
                compressedArray[i * 4 + 2] = Math.round(Math.min((payloadArray[i * 4 + 2] - min) * scaleFactor, 1.) * 0xFF); // G 
                compressedArray[i * 4 + 3] = Math.round(Math.min((payloadArray[i * 4 + 1] - min) * scaleFactor, 1.) * 0xFF); // T
            }

            return {
                array: compressedArray,
                sequenceMinMax: {
                    min: min,
                    max: max,
                },
                indicesPerBase: 4,
            }
        });
    }

    static loadSignal(
        sequenceId: string,
        lodLevel: number,
        lodStartBaseIndex: number,
        lodSpan: number
    ) {
        let samplingDensity = (1 << lodLevel);
        let startBasePair = samplingDensity * lodStartBaseIndex + 1;
        let spanBasePair = lodSpan * samplingDensity;
        let endBasePair = startBasePair + spanBasePair - 1;
        let url = `${this.apiUrl}/datatracks/ENCFF918ESR/chr1/${startBasePair}/${endBasePair}?sampling_rate=${samplingDensity}`;

        return axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            headers: {},
        }).then((a) => {
            let arraybuffer = this.parseSiriusBinaryResponse(a.data);
            let payloadArray = new Float32Array(arraybuffer);
            console.log(arraybuffer, payloadArray);
            return payloadArray;
        });
    }

    static getGraphs() {
        return axios.get(`${this.apiUrl}/graphs`).then(data => {
            return data.data;
        });
    }

    static getGraphData(graphId: string, annotationId1: string, annotationId2: string, startBp: number, endBp: number, samplingRate = 1) {
        const samplingRateQuery = `?sampling_rate=${samplingRate}`;
        const requestUrl = `${this.apiUrl}/graphs/${graphId}/${annotationId1}/${annotationId2}/${startBp}/${endBp}${samplingRateQuery}`;
        return axios.get(requestUrl);
    }

    static getTracks() {
        return axios.get(`${this.apiUrl}/tracks`).then(data => {
            return data.data;
        });
    }

    static getTrackInfo() {
        return axios.get(`${this.apiUrl}/track_info`).then(data => {
            return data.data;
        });
    }

    static getDistinctValues(index: number, query: any) {
        const requestUrl = `${this.apiUrl}/distinct_values/${index}`;
        return axios.post(requestUrl, query).then(data => {
            return data.data;
        });
    }

    static getDetails(dataID: string) {
        return axios.get(`${this.apiUrl}/details/${dataID}`).then(data => {
            return data.data;
        });
    }

    static getQueryResults(query: any, full = false, startIdx: number = null, endIdx: number = null) {
        let requestUrl = `${this.apiUrl}/query/basic`;
        if (full) {
            requestUrl = `${this.apiUrl}/query/full`;
        }
        const options = [];
        if (startIdx !== null) {
            options.push(`result_start=${startIdx}`);
        }
        if (endIdx !== null) {
            options.push(`result_end=${endIdx}`);
        }
        if (options.length > 0) {
            requestUrl = `${requestUrl}?` + options.join('&');
        }
        return axios.post(requestUrl, query).then(data => {
            return data.data;
        });
    }

    static getSuggestions(termType: string, searchText: string, maxResults = 100) {
        maxResults = Math.round(maxResults);
        const cacheKey = `${termType}|${searchText}|${maxResults}`;
        let ret = null;
        if (this.suggestionsCache[cacheKey]) {
            ret = new Promise((resolve, reject) => {
                resolve(this.suggestionsCache[cacheKey]);
            })
        } else {
            ret = axios.post(`${this.apiUrl}/suggestions`, {
                term_type: termType,
                search_text: searchText,
                max_results: maxResults,
            }).then(data => {
                this.suggestionsCache[cacheKey] = data.data.results.slice(0);
                return data.data.results;
            });
        }
        return ret;
    }

    static getUserProfile() {
        return axios.get(`${this.apiUrl}/user_profile`).then(data => {
            return data.data;
        });
    }

    private static parseSiriusBinaryResponse(arraybuffer: ArrayBuffer) {
        let byteView = new Uint8Array(arraybuffer);

        // find the start of the payload
        let nullByteIndex = 0;
        // let jsonHeader = '';
        for (let i = 0; i < arraybuffer.byteLength; i++) {
            let byte = byteView[i];
            if (byte === 0) {
                nullByteIndex = i;
                break;
            } else {
                // jsonHeader += String.fromCharCode(byte); // we usually don't care about the json header since it's a copy of input parameters
            }
        }

        let payloadBytes = arraybuffer.slice(nullByteIndex + 1);
        return payloadBytes;
    }

}

enum ArrayFormat {
    Float32 = 'f32',
    UInt8 = 'ui8',
}

interface ArrayFormatMap {
    [ArrayFormat.Float32]: Float32Array,
    [ArrayFormat.UInt8]: Uint8Array,
}

export default SiriusApi;