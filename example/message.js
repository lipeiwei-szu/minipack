export default 'hello static'

function fn () {
  import('./name.js').then(module => {
    console.log(module)
  })
}

setTimeout(fn, 2000)
