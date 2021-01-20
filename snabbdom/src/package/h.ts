/**
 * h() 函数，函数重载，兼容接受参数选择器，VNode的选项包含节点属性和hooks，子节点和 参数类型和参数数量各种情形，调用vnode()函数返回VNnode对象
 */

import { vnode, VNode, VNodeData } from './vnode'
import * as is from './is'

export type VNodes = VNode[]
export type VNodeChildElement = VNode | string | number | undefined | null
export type ArrayOrElement<T> = T | T[]
export type VNodeChildren = ArrayOrElement<VNodeChildElement>

// 给svg节点添加命名空间
function addNS (data: any, children: VNodes | undefined, sel: string | undefined): void {
  data.ns = 'http://www.w3.org/2000/svg'
  if (sel !== 'foreignObject' && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      const childData = children[i].data
      if (childData !== undefined) {
        addNS(childData, (children[i] as VNode).children as VNodes, children[i].sel)
      }
    }
  }
}

// h() 函数重载
export function h (sel: string): VNode
export function h (sel: string, data: VNodeData | null): VNode
export function h (sel: string, children: VNodeChildren): VNode
export function h (sel: string, data: VNodeData | null, children: VNodeChildren): VNode
export function h (sel: any, b?: any, c?: any): VNode {
  var data: VNodeData = {}
  var children: any
  var text: any
  var i: number
  // 处理参数，实现重载机制
  if (c !== undefined) {
    // 处理三种参数的情况
    // sel, data, children/text
    if (b !== null) {
      data = b
    }
    // 如果第三个参数是数组，设置子元素
    if (is.array(c)) {
      children = c
    // 如果c是字符串或者数字
    } else if (is.primitive(c)) {
      text = c
    // 如果c是vnode
    } else if (c && c.sel) {
      children = [c]
    }
  } else if (b !== undefined && b !== null) {
    // 处理两个参数的情况
    if (is.array(b)) {
      children = b
    } else if (is.primitive(b)) {
      text = b
    // 如果b是vnode
    } else if (b && b.sel) {
      children = [b]
    } else { data = b }
  }
  if (children !== undefined) {
    for (i = 0; i < children.length; ++i) {
      // 如果child是string/number, 创建本文节点
      if (is.primitive(children[i])) children[i] = vnode(undefined, undefined, undefined, children[i], undefined)
    }
  }
  if (
    sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    // 如果节点是svg，则添加命名空间
    addNS(data, children, sel)
  }
  // 创建一个VNode，对象并且返回
  return vnode(sel, data, children, text, undefined)
};
