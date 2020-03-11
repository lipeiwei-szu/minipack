const fs = require('fs')
const babelParser = require('@babel/parser')
const traverse = require('babel-traverse').default
const { transformFromAst } = require('babel-core')

// 每次调用createAsset就会递增
let id = 0

/**
 */
function createAsset (filename) {
  // 读取文本
  const content = fs.readFileSync(filename, 'utf-8')
  // 这一步我们需要找到这个文件中`import xxx from './xxx.js'`或者`import './xxx.js'`这种格式的文本，并将其中的路径值取出来
  // 我们有两个选择，要么是逐个解析文本中的字符，要么直接将其转换成抽象语法树（Abstract Syntax Tree，AST），然后从AST中找到对应的token
  // 于是我们使用了Babel parser，可见 https://babeljs.io/docs/en/next/babel-parser.html `The Babel parser (previously Babylon) is a JavaScript parser used in Babel.`
  const ast = babelParser.parse(content, {
    // `Files with ES6 imports and exports are considered "module"`文档里看到这句，由于我们的源代码是ES6 import的，所以这里填module
    sourceType: 'module'
  })
  // 编译完就得到AST了，至于AST是什么样子的呢？大家可以到这个在线AST编译器看看 `https://astexplorer.net/`
  // 这时候，我们需要从AST中找到`import` token，并把它的value值记录下来
  // 我们会用到一个ast遍历器，叫做`babel-traverse`，文档见`https://babeljs.io/docs/en/babel-traverse`

  // 存储依赖项路径的列表
  const dependencies = []
  // 找到所有的import关键token
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value)
    }
  })

  // 统一将AST编译到低版本CommenJS，`transformFromAst`是babel-core提供的方法
  const { code } = transformFromAst(ast, null, {
    // 这里需要对应安装`babel-preset-env`哦
    presets: ['env']
  })

  // 在此我们需要用一个id字段进行索引，便于后续通过id查找到对应的依赖项，所以我们在函数外定义了一个id字段，从0开始，每次调用createAsset都会递增
  return {
    id: id++,
    code,
    dependencies,
    filename
  }
}

module.exports = entry => {
  const asset = createAsset(entry)
  console.log(asset)
}
