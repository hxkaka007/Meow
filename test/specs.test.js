/**
 * 声明式用例注册层：扫描 test/cases/*.yaml（跳过下划线开头的字典文件），
 * 每个 case 注册成一个 node:test 用例；另有一个「字典 ↔ state()」契约自检用例，
 * 用于捕获 state() 结构漂移（仅靠 YAML 里的字段名无法发现）。
 */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var runner = require('./runner.js');
var harness = require('./harness.js');

var dir = path.join(__dirname, 'cases');
runner.caseFiles().forEach(function (file) {
  var doc = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) || {};
  (doc['用例'] || []).forEach(function (def) {
    test('[' + path.basename(file, path.extname(file)) + '] ' + (def['名称'] || '未命名用例'), function () {
      runner.runCase(def, doc['默认'] || {});
    });
  });
});

test('[契约] _fields.yaml 的所有期望字段都能在 state() 快照中定位', function () {
  var h = harness.boot({ seed: 42 });
  try {
    h.goto('play', { level: 1 });
    h.step(1);
    var state = h.state();
    var fields = runner.DICT['字段'] || {};
    assert.ok(Object.keys(fields).length > 0);
    Object.keys(fields).forEach(function (label) {
      assert.ok(runner.pathExists(state, fields[label]),
        '字段「' + label + '」(' + fields[label] + ') 在 state() 中不存在');
    });
    h.assertNoError();
  } finally {
    h.finish();
  }
});
