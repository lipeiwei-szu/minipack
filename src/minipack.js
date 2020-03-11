const fs = require('fs')
const path = require('path')
const babelParser = require('@babel/parser')
const traverse = require('babel-traverse').default
const { transformFromAst } = require('babel-core')

// 每次调用createAsset就会递增
let id = 0

/**
 *
 * @param {string} filename 文件路径
 * @returns {object} asset
 * @returns {number} asset.id
 * @returns {string} asset.code 结果babel转化后的代码字符串
 * @returns {array} asset.dependencies 依赖项列表
 * @returns {string} asset.filename 文件路径
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

/**
 * 由入口进行深度优先遍历，将依赖关系图添加到列表中
 * @param {object} entryAsset 这是一个对象，含有id,code,dependencies,filename这些字段
 * @param {number} entryAsset.id
 * @param {string} entryAsset.code 结果babel转化后的代码字符串
 * @param {array} entryAsset.dependencies 依赖项列表
 * @param {string} entryAsset.filename 文件路径
 * @return {array} queue 整个同步依赖的模块列表
 */
function createGraph (entryAsset) {
  const queue = [entryAsset]
  for (const asset of queue) {
    // 得到asset的路径（也就是去掉它的文件名），注意这里需要引入node的path模块
    const dirName = path.dirname(asset.filename)
    // 这个mapping是为了可以通过路径找到对应asset的方式，形式为dependence映射到id
    asset.mapping = {}
    // 接下来我们遍历asset的dependencies列表
    asset.dependencies.forEach(relativePath => {
      // 拼接出绝对路径
      const absolutePath = path.join(dirName, relativePath)
      // 调用步骤1的createAsset方法
      const subAsset = createAsset(absolutePath)
      // 添加到队列中，继续循环（这相当于是一个多叉树的循环式深度优先遍历）
      queue.push(subAsset)

      // 记录dependence跟id的映射关系
      asset.mapping[relativePath] = subAsset.id
    })
  }
  return queue
}

/**
 * @param {array} graph 调用步骤2`createGraph`产生的依赖关系列表
 * @return {string} 带有依赖关系并且可执行的代码字符串
 */
function bundle (graph) {
  // 由graph构建出一个id索引的对象，key为id，value为数组，第一位是可执行的函数，第二位是mapping（便于查找依赖）
  // 由于我们最终是要输出代码字符串，所以在此我们将此拼接成字符串
  let module = ''
  graph.forEach(item => {
    // 在这里，我们用函数来封装局部作用域
    module += `${item.id}: [
      function(require, module, exports) {
        ${item.code}
      },
      ${JSON.stringify(item.mapping)}
    ],`
  })

  // 注意：这段很重要，webpack编译完一般就是类似这样子的代码字符串
  // 使用立即执行函数包裹起来，避免污染全局作用域
  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id]
        
        function localRequire(path) {
          return require(mapping[path])
        }
        // 执行模块化后的函数
        const module = {
          exports: {}
        }
        
        fn(localRequire, module, module.exports)
        return module.exports
      }
    
      // 首先执行的是入口文件，也就是id为0
      require(0)
    })({${module}})
  `
  return result
}

module.exports = entry => {
  const entryAsset = createAsset(entry)
  const graph = createGraph(entryAsset)
  return bundle(graph)
}
