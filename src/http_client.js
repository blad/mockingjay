import url from 'url';
import http from 'http'
import https from 'https'

import HeaderUtil from './header_util';
import Util from './util';

let HttpClient = function (options) {
  this.options = options;
  this.logger = options.logger;
}

HttpClient.prototype.isIgnoredType = function(contentType) {
  return Util.regExArrayContains(this.options.ignoreContentType, contentType);
}

HttpClient.prototype.fetch = function (requestOptions, outputBuffer) {
  let protocolHandler = requestOptions.port == 443 ? https : http;

  return new Promise((resolve, reject) => {
    let req = protocolHandler.request(requestOptions, (res) => {
      let statusCode = res.statusCode;
      if (HeaderUtil.isText(res.headers['content-type'])) {
        this._accumulateResponse(res, requestOptions, resolve, reject);
      } else {
        if (!this.isIgnoredType(requestOptions.headers.accept)) {
          this.logger.warn('Non Textual Content-Type Detected...Piping Response from Source Server.');
        }
        this._pipeResonse(res, outputBuffer, resolve, reject);
      }
    });

    if (requestOptions.body) {
      if (requestOptions.headers['content-type'].match('application/json')) {
        req.write(JSON.stringify(requestOptions.body));
      } else {
        req.write(requestOptions.body);
      }
    }
    req.end()

    req.on('error', (error) => {
      let isIgnoredContentType = this.isIgnoredType(requestOptions.headers.accept)
      switch (error.code) {
        case 'ENOTFOUND':
          if (!isIgnoredContentType) {
            this.logger.debug('Unable to Connect to Host.');
            this.logger.debug('Check the Domain Spelling and Try Again.');
            this.logger.debug('No Data Saved for Request.');
          }
          break;
      }
      if (!isIgnoredContentType) {
        reject(error);
      } else {
        reject(false);
      }
    });
  });
}


HttpClient.prototype._pipeResonse = function (res, outputBuffer, resolve, reject) {
  let contentType = res.headers['content-type'];
  let statusCode = res.statusCode
  res.pipe(outputBuffer);

  resolve({
    status: statusCode,
    type: contentType,
    headers: res.headers,
    piped: true
  });
}


HttpClient.prototype._accumulateResponse = function (res, options, resolve, reject) {
  let contentType = res.headers['content-type'];
  let statusCode = res.statusCode;
  let responseData = '';
  res.on('data', function (chunk) {
    responseData += chunk;
  });

  res.on('end', function() {
    let isJson = contentType === 'application/json';
    resolve({
      request: options,
      status: statusCode,
      type: contentType || 'text/plain',
      headers: res.headers,
      data: options.method == 'OPTIONS' ? responseData : (isJson ? Util.parseJSON(responseData) : responseData)
    });
  });

  res.on('error', function () {
    reject('Unable to load data from request.');
  });
}

export default HttpClient;
