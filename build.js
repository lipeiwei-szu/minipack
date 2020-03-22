const minipack = require('./src/minipack')
const path = require('path')

minipack(path.resolve(__dirname, './example/index.js'), path.resolve(__dirname, 'dist'))
