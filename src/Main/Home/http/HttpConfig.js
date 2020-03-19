import React from 'react';
import {RNData, RNStorage} from '../../Common/storage/AppStorage';
import {RFApi, RFApiConst, RFHttpConfig} from 'react-native-fast-app';
import {isEmpty, selfOr} from '../../Common/utils/Utils';
import {showToast} from '../../Common/widgets/Loading';
import {ApiCredit, ApiO2O} from './Api';
import AuthToken from './AuthToken';

/**
 * RN Http请求 库设置类
 */
export default class HttpConfig {

    static initDemo() {//非站内、非标准请求
        RFHttpConfig.initHttpLogOn(true);
    }

    static initO2O() {
        RFHttpConfig
            .initHttpLogOn(true)
            .initBaseUrl(ApiO2O.baseUrl)
            .initContentType(RFApiConst.CONTENT_TYPE_URLENCODED)
            .initParamSetFunc((params, request) => {
                if (request.internal && !isEmpty(RNStorage.accessToken)) {
                    params.access_token = RNStorage.accessToken;
                }
            })
            .initParseDataFunc((result, request, callback) => {
                let {success, json, message, status} = result;
                if (status === 401) {//Token过期
                    showToast('token过期，请重新登录');
                } else {
                    let {data, errorCode, msg, extra} = json;
                    callback(success && 'SUCCESS'.equals(errorCode), selfOr(data, {}), selfOr(msg, message), errorCode);
                }
            });
    }


    static initCredit() {
        RFHttpConfig
            .initHttpLogOn(true)
            .initBaseUrl(ApiCredit.baseUrl)
            .initContentType(RFApiConst.CONTENT_TYPE_URLENCODED)
            .initHeaderSetFunc((headers, request) => {
                if (request.internal) {
                    Object.assign(headers, AuthToken.baseHeaders());//添加基础参数
                    headers.customerId = RNStorage.customerId;
                    if (RNStorage.refreshToken) {//若refreshToken不为空，则拼接
                        headers['access-token'] = RNStorage.accessToken;
                        headers['refresh-token'] = RNStorage.refreshToken;
                    }
                }
            })
            .initParamSetFunc((params, request) => {
                if (request.internal && RNStorage.customerId) {
                    params.CUSTOMER_ID = RNStorage.customerId;
                }
            }).initParseDataFunc(async (result, request, callback) => {
            let {success, json, response, message, status} = result;
            AuthToken.parseTokenRes(response);//解析token
            if (status === 503) {//指定的Token过期标记
                if (isEmpty(RNStorage.refreshToken) || isEmpty(RNStorage.customerId)) {
                    showToast('Token过期，退出登录');
                }
                if (RNData.hasQueryToken) {//若已发请求，则保存失败的请求
                    RNData.tokenExpiredList.push({retryRequest: request, retryCallback: callback})
                } else {//否则，标记为已请求
                    RNData.hasQueryToken = true;
                    RNData.queryTokenHttp = await AuthToken.getAccessToken().then(() => {
                        request.resendRequest(request, callback);

                        RNData.tokenExpiredList.map(({retryRequest, retryCallback}) => {
                            retryRequest.resendRequest(retryRequest, retryCallback);
                        });
                        RNData.tokenExpiredList = [];
                        RNData.hasQueryToken = false;
                    })
                }
            } else {
                let {successful, msg, code} = json;
                callback(success && successful === 1, selfOr(json.data, {}), selfOr(msg, message), code);
            }
        });
    }

}
