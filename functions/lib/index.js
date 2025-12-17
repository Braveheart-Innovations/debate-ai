"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAppStoreNotification = exports.handlePlayStoreNotification = exports.validatePurchase = void 0;
var validatePurchase_1 = require("./validatePurchase");
Object.defineProperty(exports, "validatePurchase", { enumerable: true, get: function () { return validatePurchase_1.validatePurchase; } });
var playStore_1 = require("./notifications/playStore");
Object.defineProperty(exports, "handlePlayStoreNotification", { enumerable: true, get: function () { return playStore_1.handlePlayStoreNotification; } });
var appStore_1 = require("./notifications/appStore");
Object.defineProperty(exports, "handleAppStoreNotification", { enumerable: true, get: function () { return appStore_1.handleAppStoreNotification; } });
