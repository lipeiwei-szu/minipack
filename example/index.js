
const button = document.createElement('button')
button.innerText = '点击获取异步脚本'
button.onclick = function () {
  import('./print.js').then(exports => {
    exports.print('this is a demo of aysnc load')
  })
}

document.body.appendChild(button)
