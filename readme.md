### 前言
本篇是看了[Ronen Amiel - Build Your Own Webpack](https://www.youtube.com/watch?v=Gc9-7PBqOC8&list=LLHK1mTHpwrUeYgF5gu-Kd4g)之后写的，同步加载机制与[minipack](https://github.com/ronami/minipack)基本相似，会在此基础上处理module缓存、循环引用、异步加载等问题

### 参考链接
+ [Ronen Amiel - Build Your Own Webpack](https://www.youtube.com/watch?v=Gc9-7PBqOC8&list=LLHK1mTHpwrUeYgF5gu-Kd4g)
+ [minipack](https://github.com/ronami/minipack)

### 进度
+ [x] 同步加载
+ [x] module缓存
+ [x] 循环引用
+ [x] 异步加载（已完成，待测试完善）

### 实现逻辑
+ [如何实现一个支持异步加载的打包工具（一）](https://github.com/lipeiwei-szu/blog/issues/2)
+ [如何实现一个支持异步加载的打包工具（二）](https://github.com/lipeiwei-szu/blog/issues/3)
+ 如何实现一个支持异步加载的打包工具（三）（todo）