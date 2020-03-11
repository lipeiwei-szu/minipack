const minipack = require('../src/minipack')

const result = minipack('./entry.js')
// 打印关联之后的代码字符串
console.log(result)
// 使用eval执行，确定结果是否正确
// eval(result)
