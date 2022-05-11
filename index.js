const fs = require('fs')
const path = require('path')
const babelParser = require('@babel/parser')
const { transformFromAst } = require('@babel/core')
const traverse = require('@babel/traverse').default;
const config = require('./minipack.config')

const entry = config.entry;
const output = config.output;


//解析文件内容及依赖，期望返回dependencies:文件依赖模块，code:文件解析内容
function createAsset(filename) {
    const content = fs.readFileSync(filename, 'utf-8')
    const ast = babelParser.parse(content, {
        sourceType: 'module'
    })
    const dependencies = []

    traverse(ast, {
        ImportDeclaration: ({
            node
        }) => {
            dependencies.push(node.source.value)
        }
    })

    const { code } = transformFromAst(ast, null, {
        presets: ['@babel/preset-env']
    })
    return {
        code,
        dependencies
    }
}

// 从入口文件开始获取整个依赖图

function createGraph(entry) {
    const mainAssert = createAsset(entry)
    const queue = {
        [entry]: mainAssert
    }
    function recursionDep(filename, assert) {
        assert.mapping = {}
        // 获取绝对路径
        const dirname = path.dirname(filename)
        assert.dependencies.forEach(relativePath => {

            const absolutePath = path.join(dirname, relativePath)
            assert.mapping[relativePath] = absolutePath;
            if (!queue[absolutePath]) {
                const child = createAsset(absolutePath)
                queue[absolutePath] = child;
                if (child.dependencies.length > 0) {
                    recursionDep(absolutePath, child)
                }
            }
        })
    }
    for (let filename in queue) {
        let assert = queue[filename]
        recursionDep(filename, assert)
    }
    return queue;
}



function bundle(graph) {
    let modules = ''
    for (let filename in graph) {
        let mod = graph[filename]
        modules += `'${filename}': [
              function(require,module,exports){
                  ${mod.code}
              },
              ${JSON.stringify(mod.mapping)},
            ],`

    }
    const result = `
  (function(modules){
      function require(moduleId) {
          const [fn,mapping] = modules[moduleId]
          function localRequire(name){
              return require(mapping[name])
          }
          const module = {exports: {}}
          fn(localRequire,module,module.exports)
          return module.exports;
      }
      require('${entry}')
  })({${modules}})`
    return result;
}

// 输出打包
function writeFile(path, result) {
    fs.writeFile(path, result, (err) => {
        if (err) throw err;
        console.log('rayns 文件已被保存')
    })
}

const graphs = createGraph(entry)

const result = bundle(graphs)
console.log(result)

fs.access(`${output.path}/${output.filename}`, (err) => {
    if (!err) {
        writeFile(`${output.path}/${output.filename}`, result)
    } else {
        fs.mkdir(output.path, { recursive: true }, (err_m) => {
            if (err_m) throw err_m;
            writeFile(`${output.path}/${output.filename}`, result)
        })
    }
})



