const fs = require('fs')
const path = require('path')
const babelParser = require('@babel/parser')
const traverse = require('babel-traverse').default
const { transformFromAst } = require('babel-core')

// 每次调用createAsset就会递增
let ID = 0

/**
 *
 * @param {string} filename 文件路径
 * @param {boolean} isDynamic 是否异步加载的 默认为false
 * @returns {object} asset
 * @returns {number} asset.id
 * @returns {string} asset.code 结果babel转化后的代码字符串
 * @returns {array} asset.dependencies 依赖项列表
 * @returns {string} asset.filename 文件路径
 */
function createAsset (filename, isDynamic = false) {
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

  // 存储依赖项路径的列表（同步的）
  const dependencies = []
  // 异步的
  const dynamicDependencies = []
  // 找到所有的import关键token
  traverse(ast, {
    ImportDeclaration: (path) => {
      const node = path.node
      dependencies.push(node.source.value)
    },
    // 异步加载
    Import: function (path) {
      const parent = path.parent
      // 将路径取出来
      dynamicDependencies.push(parent.arguments[0].value)
    }
  })

  // 统一将AST编译到低版本CommenJS，`transformFromAst`是babel-core提供的方法
  let { code } = transformFromAst(ast, null, {
    // 这里需要对应安装`babel-preset-env`哦
    presets: ['env']
  })

  // todo 不知道该怎么去将异步加载的import替换掉，所以目前先用了正则匹配替换
  code = code.replace(/import\(/g, 'require.async(')

  // 在此我们需要用一个id字段进行索引，便于后续通过id查找到对应的依赖项，所以我们在函数外定义了一个id字段，从0开始，每次调用createAsset都会递增
  return {
    id: ID++,
    code,
    isDynamic,
    dependencies,
    dynamicDependencies,
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
  // 用来检验循环引用导致的死循环问题，key为绝对路径，value为module id
  const pathMap = {}

  //
  function fn (relativePath, dirName, asset, isDynamic) {
    // 拼接出绝对路径
    const absolutePath = path.join(dirName, relativePath)
    // 如果缓存中已经有该路径，直接将其对应的module id赋值到mapping上
    if (Object.prototype.hasOwnProperty.call(pathMap, absolutePath)) {
      asset.mapping[relativePath] = pathMap[absolutePath]
      return
    }

    // 调用步骤1的createAsset方法
    const subAsset = createAsset(absolutePath, isDynamic)
    // 添加到队列中，继续循环（这相当于是一个多叉树的循环式深度优先遍历）
    queue.push(subAsset)

    // 记录dependence跟id的映射关系
    asset.mapping[relativePath] = subAsset.id
    // 新增代码：缓存下来
    pathMap[absolutePath] = subAsset.id
  }

  for (const asset of queue) {
    // 得到asset的路径（也就是去掉它的文件名），注意这里需要引入node的path模块
    const dirName = path.dirname(asset.filename)
    // 这个mapping是为了可以通过路径找到对应asset的方式，形式为dependence映射到id
    asset.mapping = {}
    // 接下来我们遍历asset的dependencies列表

    // todo 这里逻辑怪怪的（一个异步模块依赖了其它模块，该怎么办）
    asset.dependencies.forEach(relativePath => fn(relativePath, dirName, asset, false))
    // 异步动态加载
    asset.dynamicDependencies.forEach(relativePath => fn(relativePath, dirName, asset, true))
  }
  return queue
}

/**
 * @param {array} graph 调用步骤2`createGraph`产生的依赖关系列表
 * @param {string} distPath 打包路径
 * @return {object} 带有依赖关系并且可执行的代码字符串
 */
function bundle (graph, distPath) {
  if (!fs.existsSync(distPath)) {
    // 新建目录
    fs.mkdirSync(distPath)
  }

  let module = ''
  graph.forEach(item => {
    if (item.isDynamic) {
      // 动态加载
      const chunk = `
        (function() {
          window.webpackJsonpCallback({
            id: ${item.id},
            fn: function(require, module, exports) {
              ${item.code}
            },
            mapping: ${JSON.stringify(item.mapping)}
          })
        })()
      `
      // 写入文件
      fs.writeFile(`${distPath}/${item.id}.js`, chunk, 'utf8', function (error) {
        if (error) {
          console.warn(error)
        } else {
          console.log(`写入${item.id}.js成功`)
        }
      })
    } else {
      // 同步加载
      // 由graph构建出一个id索引的对象，key为id，value为数组，第一位是可执行的函数，第二位是mapping（便于查找依赖）
      // 在这里，我们用函数来封装局部作用域
      module += `${item.id}: [
        function(require, module, exports) {
          ${item.code}
        },
        ${JSON.stringify(item.mapping)}
      ],`
    }
  })

  // 注意：这段很重要，webpack编译完一般就是类似这样子的代码字符串
  // 使用立即执行函数包裹起来，避免污染全局作用域
  const main = `
(function (modules) {
  //
  const installedChunks = {}

  // 缓存module返回的exports对象，以id为索引
  const moduleCache = {}
  function require(id) {
    // 优先从缓存对象中读取
    if (moduleCache[id]) {
      return moduleCache[id]
    }

    if (!modules[id]) {
      return null
    }

    const [fn, mapping] = modules[id]
    
    function localRequire(path) {
      return require(mapping[path])
    }

    // 异步加载
    localRequire.async = function (path) {
      const chunkId = mapping[path]
      if (installedChunks[chunkId] === 0) {
        // 参照webpack，为0则代表已加载成功
        return Promise.resolve(require(chunkId))
      } else if (installedChunks[chunkId]) {
        // 加载中，返回正在等待被处理的promise
        return installedChunks[chunkId][2]
      } else {
        const promise = new Promise((resolve, reject) => {
          installedChunks[chunkId] = [resolve, reject]
        })

        installedChunks[chunkId].push(promise)

        // 构建jsonp请求
        const script = document.createElement('script')
        script.charset = 'utf-8'
        script.src = chunkId + '.js'
        // 超时处理
        const timeout = setTimeout(function () {
          onScriptComplete({type: 'timeout', target: script})
        }, 120000)

        function onScriptComplete(event) {
          // todo
        }

        script.onerror = script.onload = onScriptComplete
        // 启动JSONP请求
        document.head.appendChild(script)
        return promise
      }
    }

    // 执行模块化后的函数
    const module = {
      exports: {}
    }
    // 注意，在执行fn函数前就得先缓存起来，避免循环引用的问题
    moduleCache[id] = module.exports
    fn(localRequire, module, module.exports)
    return module.exports
  }

  window.webpackJsonpCallback = function (data) {
    const {id, fn, mapping} = data
    // 将fn跟mapping缓存到modules中
    modules[id] = [fn, mapping]

    // 取出
    const [resolve] = installedChunks[id]
    // 表示加载成功
    installedChunks[id] = 0

    resolve(require(id))
  }

  // 首先执行的是入口文件，也就是id为0
  require(0)
})({${module}})
`
  // 写入文件
  fs.writeFile(`${distPath}/main.js`, main, 'utf8', function (error) {
    if (error) {
      console.warn(error)
    } else {
      console.log('写入main.js成功')
    }
  })
}

function build (entry, distPath) {
  const entryAsset = createAsset(entry)
  const graph = createGraph(entryAsset)
  return bundle(graph, distPath)
}

module.exports = build
