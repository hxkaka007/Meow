/**
 * 声明式用例注册层：扫描 test/cases/*.yaml（跳过下划线开头的字典文件），
 * 每个 case 注册成一个 node:test 用例。这里没有任何用例内容。
 */
'use strict';

var test = require('node:test');
var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var runner = require('./runner.js');

var dir = path.join(__dirname, 'cases');
runner.caseFiles().forEach(function (file) {
  var doc = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) || {};
  (doc['用例'] || []).forEach(function (def) {
    test('[' + path.basename(file, path.extname(file)) + '] ' + (def['名称'] || '未命名用例'), function () {
      runner.runCase(def, doc['默认'] || {});
    });
  });
});
