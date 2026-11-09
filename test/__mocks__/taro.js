/* Taro 的空壳 mock：只提供被测代码会碰到的同步 API，行为与真机一致的部分才模拟。
   没有的能力（eventCenter）保持不存在 —— 让测试暴露「用了不该用的东西」，
   而不是靠 mock 把问题藏起来。
   文件系统是例外：backup 的读写是整个备份功能的核心，
   给它一个内存实现（真的写入/读回/删除），测的才是逻辑而不是「函数被调过」。 */
const store = new Map()

/* 内存文件系统：path → utf8 字符串 或 base64 字符串（用 enc 区分）。 */
const files = new Map()

const Taro = {
  getStorageSync(key) {
    return store.has(key) ? store.get(key) : ''
  },
  setStorageSync(key, value) {
    store.set(key, value)
  },
  removeStorageSync(key) {
    store.delete(key)
  },
  clearStorageSync() {
    store.clear()
  },
  /* 文件类 API 在小程序里返回 Promise；测试里调用即记录，不真的删文件 */
  removeSavedFile() {
    return Promise.resolve({ errMsg: 'removeSavedFile:ok' })
  },
  /* 顶部留白实测：默认返回 null（表示量不到），测试里按机型覆盖 */
  getMenuButtonBoundingClientRect() {
    return null
  },
  /* 内存文件系统：签名与微信 FileSystemManager 一致，读写真的生效。 */
  getFileSystemManager() {
    return {
      writeFileSync(filePath, data, encoding) {
        if (typeof filePath !== 'string' || !filePath) throw new Error('bad path')
        files.set(filePath, { data: String(data), encoding: encoding || 'utf8' })
      },
      readFileSync(opts) {
        /* 两种调用形式都要支持：readFileSync({filePath, encoding}) 和 readFileSync(path, encoding) */
        let filePath
        if (typeof opts === 'string') {
          filePath = opts
        } else {
          filePath = opts && opts.filePath
        }
        const f = files.get(filePath)
        if (!f) throw new Error('no such file: ' + filePath)
        return f.data
      },
      unlinkSync(opts) {
        const filePath = typeof opts === 'string' ? opts : opts && opts.filePath
        files.delete(filePath)
      },
    }
  },
  env: { USER_DATA_PATH: 'wxfile://usr' },
  /* saveFile：真机是「把临时文件复制进持久区并返回新路径」，
     mock 必须真复制 —— 否则测试里原文件被 unlink 后就查不到了。 */
  saveFileSync(path) {
    const dest = 'wxfile://store/' + path.split('/').pop()
    if (files.has(path)) files.set(dest, files.get(path))
    return { savedFilePath: dest }
  },
  chooseImage() {
    return Promise.resolve({ tempFilePaths: [] })
  },
  saveFile() {
    return Promise.resolve({ savedFilePath: '' })
  },
  pxTransform: (v) => v + 'px',
  showToast() {},
  showModal() {
    return Promise.resolve({ confirm: true })
  },
  setNavigationBarTitle() {
    return Promise.resolve({})
  },
  eventCenter: null,
  /* 测试用：把内存文件系统清空 / 直接塞文件 */
  __files: files,
}

module.exports = Taro
module.exports.default = Taro
