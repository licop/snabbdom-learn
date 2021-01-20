/**
 * init()是一个高阶函数，内部初始化modules和domApi，然后返回一个patch函数
 * 好处是可以缓存参数，不用每次调用patch函数都传入modules和domApi
 */
import { Module } from './modules/module'
import { vnode, VNode } from './vnode'
import * as is from './is'
import { htmlDomApi, DOMAPI } from './htmldomapi'

type NonUndefined<T> = T extends undefined ? never : T

function isUndef (s: any): boolean {
  return s === undefined
}
function isDef<A> (s: A): s is NonUndefined<A> {
  return s !== undefined
}

type VNodeQueue = VNode[]

const emptyNode = vnode('', {}, [], undefined, undefined)

function sameVnode (vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel
}
// 判断是否是VNode对象
function isVnode (vnode: any): vnode is VNode {
  return vnode.sel !== undefined
}

type KeyToIndexMap = {[key: string]: number}

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
}

type ModuleHooks = ArraysOf<Required<Module>>

function createKeyToOldIdx (children: VNode[], beginIdx: number, endIdx: number): KeyToIndexMap {
  const map: KeyToIndexMap = {}
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i]?.key
    if (key !== undefined) {
      map[key] = i
    }
  }
  return map
}
// 模块钩子函数的名称
const hooks: Array<keyof Module> = ['create', 'update', 'remove', 'destroy', 'pre', 'post']

/**
 * 
 * @param modules 模块数组
 * @param domApi  如果需要跨平台渲染虚拟dom，传入其他平台的操作dom的Api, 默认为操作浏览器dom的Api
 */
export function init (modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number
  let j: number
  // 模块的钩子函数集合
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: []
  }

  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi
  
  // 遍历模块的钩子函数
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      const hook = modules[j][hooks[i]]
      if (hook !== undefined) {
        // cbs --> {create: [fn1, fn2], update: [fn1, fn2]...}
        (cbs[hooks[i]] as any[]).push(hook)
      }
    }
  }

  /**
   * 把dom元素转化为vnode
   * @param elm 
   */
  function emptyNodeAt (elm: Element) {
    const id = elm.id ? '#' + elm.id : ''
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : ''
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm)
  }
  
  // 高阶函数，返回删除dom的回调函数
  // 模块和用户传入的每个remove钩子函数，都要调用删除dom的函数rm()
  function createRmCb (childElm: Node, listeners: number) {
    return function rmCb () {
      // 所有的remove钩子被执行过以后，才会执行删除dom的操作
      // 防止重复删除dom元素
      if (--listeners === 0) {
        const parent = api.parentNode(childElm) as Node
        api.removeChild(parent, childElm)
      }
    }
  }

  /**
   * 
   * @param vnode 将vnode转化为Dom元素，返回dom，并将dom挂载到vnode.elm上
   * @param insertedVnodeQueue Vnode上用户传入的insert钩子的队列
   */
  function createElm (vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any
    let data = vnode.data
    // 执行用户设置的init钩子函数
    if (data !== undefined) {
      const init = data.hook?.init
      if (isDef(init)) {
        init(vnode)
        data = vnode.data
      }
    }
    // 把vnode转换成真实dom对象(没有渲染到页面)
    const children = vnode.children
    const sel = vnode.sel
    // 如果选择器是！，创建空的注释节点
    if (sel === '!') {
      if (isUndef(vnode.text)) {
        vnode.text = ''
      }
      vnode.elm = api.createComment(vnode.text!)
    } else if (sel !== undefined) {
      // Parse selector
      // 解析选择器
      const hashIdx = sel.indexOf('#')
      const dotIdx = sel.indexOf('.', hashIdx)
      const hash = hashIdx > 0 ? hashIdx : sel.length
      const dot = dotIdx > 0 ? dotIdx : sel.length
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel
      const elm = vnode.elm = isDef(data) && isDef(i = data.ns)
        ? api.createElementNS(i, tag)
        : api.createElement(tag)
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot))
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '))
      // 执行模块中的create钩子函数
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode)
      // 如果vnode有子节点，创建子vnode对应的DOM元素追加到elm上
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i]
          if (ch != null) {
            // 递归
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue))
          }
        }
      // 如果是文本则创建文本节点追加到elm上
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text))
      }
      
      const hook = vnode.data!.hook
      if (isDef(hook)) {
        // 调用用户传入的create钩子函数
        hook.create?.(emptyNode, vnode)
        // 如果用户传入insert钩子函数，将当前vnode存储到inseredVodeQuene队列中
        if (hook.insert) {
          insertedVnodeQueue.push(vnode)
        }
      }
    } else {
      // 如果选择器为空，创建文本节点
      vnode.elm = api.createTextNode(vnode.text!)
    }
    // 返回创建的DOM
    return vnode.elm
  }
  
  /**
   * 
   * @param parentElm 父节点
   * @param before    在这个节点之前插入
   * @param vnodes    vnode数组
   * @param startIdx  需要vnode数组元素的起始索引
   * @param endIdx    需要vnode数组元素的结束索引
   * @param insertedVnodeQueue 
   */
  function addVnodes (
    parentElm: Node,
    before: Node | null,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before)
      }
    }
  }

  /**
   * 执行destory钩子函数
   * @param vnode 
   */
  function invokeDestroyHook (vnode: VNode) {
    const data = vnode.data
    if (data !== undefined) {
      // 执行用户传入的destroy钩子函数
      data?.hook?.destroy?.(vnode)
      // 执行模块中的destory钩子函数
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
      // 如果有子节点递归调用
      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j]
          if (child != null && typeof child !== 'string') {
            invokeDestroyHook(child)
          }
        }
      }
    }
  }

  /**
   * 
   * @param parentElm 父节点
   * @param vnodes    vnode数组
   * @param startIdx  需要vnode数组元素的起始索引
   * @param endIdx    需要vnode数组元素的结束索引
   */
  function removeVnodes (parentElm: Node,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number
      let rm: () => void
      const ch = vnodes[startIdx]
      if (ch != null) {
        if (isDef(ch.sel)) {
          // 执行用户传入和模块中的destory钩子函数
          invokeDestroyHook(ch)
          // listeners变量的作用防止重复删除dom元素
          listeners = cbs.remove.length + 1
          // 获取删除dom的函数
          rm = createRmCb(ch.elm!, listeners)
          // 触发模块中的remove的钩子函数
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm)
          
          const removeHook = ch?.data?.hook?.remove
          // 如果用户传入remove钩子函数,则调用钩子函数，将rm()函数传递给用户执行
          // 如果没传入remove钩子函数，则直接执行rm()函数，删除dom
          if (isDef(removeHook)) {
            removeHook(ch, rm)
          } else {
            rm()
          }
        } else { // Text node
          api.removeChild(parentElm, ch.elm!)
        }
      }
    }
  }
  
  /**
   * 对比子节点的差异，并更新真实dom，diff算法的核心
   * @param parentElm 
   * @param oldCh 
   * @param newCh 
   * @param insertedVnodeQueue 
   */
  function updateChildren (parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx: KeyToIndexMap | undefined
    let idxInOld: number
    let elmToMove: VNode
    let before: any
    // 同级别节点比较
    // 循环遍历新旧节点，当 oldStartIdx > oldEndIdx 或者 newStartIdx > newEndIdx时，循环结束
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx]
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx]
      // 比较开始和结束的4种情况
      // 比较开始节点，调用 patchVnode() 对比和更新节点，移动索引
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      // 比较结束节点，调用 patchVnode() 对比和更新节点，移动索引
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      // 旧开始节点/新结束节点相同， 把 oldStartVnode 对应的 DOM 元素，移动到右边
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldStartVnode.elm!, api.nextSibling(oldEndVnode.elm!))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      // 旧结束节点/新开始节点相同, 把 oldEndVnode 对应的 DOM 元素，移动到左边
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        // 如果新旧vnode节点的开始和结束都各不相等，遍历新节点
        // 使用新节点的newStartVnode的key值在老节点数组中找相同的节点

        if (oldKeyToIdx === undefined) {
          // 将key和旧的vnode节点索引做映射
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        }
        idxInOld = oldKeyToIdx[newStartVnode.key as string]
        if (isUndef(idxInOld)) { // New element
          // 如果没找到相同的key值，说明是新的节点，创建新节点对应的dom元素插入到dom树中
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
        } else {
          // 如果找到了相同的key值

          elmToMove = oldCh[idxInOld]
          // 判断新节点和找到的老节点的 sel 选择器是否相同
          // 如果不相同，说明节点被修改了
          // 重新创建对应的 DOM 元素，插入到 DOM 树中
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
          } else {
            // 如果相同，把 elmToMove 对应的 DOM 元素，移动到左边
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined as any
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!)
          }
        }
        
        newStartVnode = newCh[++newStartIdx]
      }
    }
    // 循环结束的收尾工作
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) {
        // 如果老节点的数组先遍历完(oldStartIdx > oldEndIdx)，说明新节点有剩余，把剩余节点批量插入到右边
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
      } else {
        // 如果新节点的数组先遍历完(newStartIdx > newEndIdx)，说明老节点有剩余，把剩余节点批量删除
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
      }
    }
  }
  /**
   * 对比新旧Vnode的节点，找到差异，然后更新到真实dom上
   * @param oldVnode 
   * @param vnode 
   * @param insertedVnodeQueue 
   */
  function patchVnode (oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    // 第一过程： 触发patchVnode和update钩子函数
    const hook = vnode.data?.hook
    // 执行新节点的prepatch钩子函数
    hook?.prepatch?.(oldVnode, vnode)
    const elm = vnode.elm = oldVnode.elm!
    const oldCh = oldVnode.children as VNode[]
    const ch = vnode.children as VNode[]
    // 判断节点是否完全相同
    if (oldVnode === vnode) return
    // 执行模块和新节点的update钩子函数
    if (vnode.data !== undefined) {
      for (let i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      vnode.data.hook?.update?.(oldVnode, vnode)
    }
    
    // 第二过程: 真正对比新旧vnode差异的地方，找到差异过后会立即更新真实dom
    // 新节点不是文本节点，有子节点
    if (isUndef(vnode.text)) {
      // 如果新旧vnode都有子节点
      if (isDef(oldCh) && isDef(ch)) {
        // 不相等则调用updateChildren(),使用diff算法更新子节点
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue)
      } else if (isDef(ch)) {
        // 新节点有子节点，老节点是文本节点，清空文本节点，elm添加子节点
        if (isDef(oldVnode.text)) api.setTextContent(elm, '')
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
       // 老节点有子节点，新节点为空，清空dom元素
      } else if (isDef(oldCh)) { 
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      // 老节点是文本节点，新节点为空，清空文本
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, '')
      } // 新节点是本文节点，且和老节点不相等
    } else if (oldVnode.text !== vnode.text) {
      if (isDef(oldCh)) {
        // 删除老节点
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      }
      // 更新文本节点
      // 注意: 本文发生变化是dom元素没有重建，还是沿用之前的dom元素
      api.setTextContent(elm, vnode.text!)
    }

    // 第三过程: 触发postpatch钩子函数
    hook?.postpatch?.(oldVnode, vnode)
  }
  
  // 返回一个patch函数
  // patch是核心函数，作用是对比两个VNode，然后更新VNode
  return function patch (oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node
    const insertedVnodeQueue: VNodeQueue = []
    // 遍历模块中的pre钩子函数，然后执行
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]()
    // 如果oldVnode是dom转化为VNode对象
    if (!isVnode(oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode)
    }
    // 判断节点的key和sel是否相同
    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue)
    } else {
      // 如果节点的key和sel不相同
      // 在父元素中添加新的节点，移除老的节点
      elm = oldVnode.elm!
      parent = api.parentNode(elm) as Node
      // 把vnode节点转化为dom元素，把dom节点存储到elm的属性中
      // 没有把创建的元素挂载到dom中
      createElm(vnode, insertedVnodeQueue)
      
      if (parent !== null) {
        // 把vnode.elm插入到dom树中
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm))
        // 从父节点中移除旧的Vnode
        removeVnodes(parent, [oldVnode], 0, 0)
      }
    }
    // 遍历执行所有vnode的insert钩子函数传入的钩子函数
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i])
    }
    // 遍历模块中的post钩子函数，然后执行
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]()
    return vnode
  }
}
