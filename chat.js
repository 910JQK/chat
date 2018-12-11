const URL = 'ws://127.0.0.1:8102'


var socket = null
var 名字 = ''
var 频道列表 = []
var 用户列表 = {}
var 已加入频道表 = new Set()
var 当前频道 = ''
var 滚动位置 = {}


function is_scrolled_to_bottom(view) {
    return view.scrollTop == view.scrollTopMax
}


function scroll_to_bottom(view) {
    return view.scrollTop = view.scrollTopMax
}


function get_color(str) {
    let t = 1
    let u = 0
    for ( let code of map(str, c => c.codePointAt(0)) ) {
        t *= (10*code + u) % 1e10
        u += (10*code * t) % 1e10
    }
    return `hsl(${(t+u) % 357}, ${58 + (t % 47)}%, ${23 + (u % 43)}%)`
}


function 更新名字 (新名字) {
    名字 = 新名字
    名字提示.textContent = 新名字
}


function 是否提到自己 (字串) {
    return 字串.split(' ').indexOf(`@${名字}`) != -1
}


function 渲染消息 (消息视图) {
    let 滚动到最后 = is_scrolled_to_bottom(消息列表视图)    
    消息列表视图.appendChild(消息视图)
    if ( 滚动到最后 ) {
        scroll_to_bottom(消息列表视图)
    }    
}


function 渲染用户列表 () {
    列表 = 用户列表[当前频道]
    用户数量视图.textContent = `当前 ${列表.length} 人在线`
    clear(用户列表视图)
    map(列表, 名字 => 用户列表视图.appendChild(create({
        tag: 'user-item',
        style: { color: get_color(名字) },
        textContent: 名字
    })))
}


function 清空用户列表 () {
    用户数量视图.textContent = ''
    clear(用户列表视图)
}


var 如何处理消息 = [
    {
        类型: one_of('说话'),
        执行动作: function (消息) {
            let 频道 = 消息.频道
            let 谁 = 消息.内容.谁
            let 说了什么 = 消息.内容.说了什么
            let 颜色 = get_color(谁)
            渲染消息(create({
                tag: 'message',
                dataset: {
                    频道: 频道,
                    消息类型: '说话',
                    是否高亮: 是否提到自己(说了什么)
                },
                children: [
                    { tag: 'recv-time', textContent: `(${消息.收到时间})`,
                      style: { color: 颜色 } },
                    { tag: 'say-name', textContent: 谁,
                      style: { color: 颜色 } },
                    { tag: 'say-content', textContent: 说了什么 }
                ]
            }))
        }
    },
    {
        类型: one_of('通知', '反馈'),
        执行动作: function (消息) {
            渲染消息(create({
                tag: 'message',
                dataset: {
                    消息类型: 消息.类型,
                    频道: 消息.频道? 消息.频道: null
                },
                children: [
                    { tag: 'recv-time', textContent: `(${消息.收到时间})` },
                    { tag: 'info', textContent: 消息.内容 }
                ]
            }))
        }
    },
    {
        类型: one_of('用户列表'),
        执行动作: function (消息) {
            let 频道 = 消息.频道
            用户列表[频道] = 消息.内容.sort()
            if ( 频道 == 当前频道 ) {
                渲染用户列表()
            }
        }
    },
    {
        类型: one_of('名字更新'),
        执行动作: function (消息) {
            更新名字(消息.内容)
        }
    },
    {
        类型: one_of('确认'),
        执行动作: function (消息) {
            function 反馈消息视图 (文字) {
                return create({
                    tag: 'message',
                    dataset: { 消息类型: '反馈' },
                    children: [
                        { tag: 'recv-time',
                          textContent: `(${消息.收到时间})` },
                        { tag: 'info', textContent: 文字 }
                    ]
                })
            }
            if ( 消息.内容.确认什么 == '成功加入频道' ) {
                let 频道 = 消息.内容.频道
                let 主题 = 消息.内容.主题
                已加入频道表.add(频道)
                切换频道(频道)
                渲染消息(反馈消息视图(`已加入频道: ${频道} ~ ${主题}`))
            } else if ( 消息.内容.确认什么 == '成功退出频道' ) {
                let 频道 = 消息.内容.频道
                已加入频道表.delete(频道)
                let l = map(已加入频道表, x=>x)
                let 退回频道 = l[l.length-1]
                切换频道(退回频道 || '')
                if (!退回频道) {
                    scroll_to_bottom(消息列表视图)
                }
            }
        }
    },
    {
        类型: one_of('频道列表'),
        执行动作: function (消息) {
            频道列表 = 消息.内容
        }
    }
]


function 处理消息 (消息) {
    消息.收到时间 = (new Date()).toTimeString().replace(/ .*/, '')
    for ( let 模式 of 如何处理消息 ) {
        if (模式.类型.has(消息.类型)) {
            模式.执行动作(消息)
        }
    }
}


function 发送消息 (消息) {
    socket.send(JSON.stringify(消息))
}


function 切换频道 (频道) {
    当前频道 = 频道
    频道提示.textContent = 当前频道 || '---'
    if (当前频道) {
        退出按钮.href = 'javascript:void(0)'
        inject_style('channel', create_style([
            [[`message[data-频道="${当前频道}"]`], { display: 'block' }]
        ]))
        渲染用户列表()
        if ( 滚动位置[当前频道] ) {
            let r = 滚动位置[当前频道]
            if (r.滚到最后) {
                scroll_to_bottom(消息列表视图)
            } else {
                消息列表视图.scrollTop = r.数值
            }
        }
    } else {
        退出按钮.removeAttribute('href')
        inject_style('channel', create_style([]))
        清空用户列表()
    }
}


function 说话 (说了什么) {
    //发送消息({ 命令: '说话', 说了什么: 说了什么 })
    发送消息({ 命令: '说话', 说了什么: 说了什么, 频道: 当前频道 })
}


function 改名 (新名字) {
    发送消息({ 命令: '改名', 新名字: 新名字 })
}


var handlers = {
    open: function (ev) {
        console.log('Connected')
    },
    close: function (ev) {
        console.log('Disconnected')
    },
    message: function (ev) {
        console.log(ev.data)
        处理消息(JSON.parse(ev.data))
    }
}


function init () {
    socket = new WebSocket(URL)
    map(handlers, (event, handler) => socket.addEventListener(event, handler))
    切换频道('')
    消息列表视图.addEventListener('scroll', function (ev) {
        if ( 当前频道 ) {
            滚动位置[当前频道] = {
                数值: 消息列表视图.scrollTop,
                滚到最后: is_scrolled_to_bottom(消息列表视图)
            }
        }
    })
    输入框.addEventListener('keyup', function (ev) {
        if (ev.key == 'Enter') {
            let 说了什么 = 输入框.value.trimRight()
            if (说了什么) {
                说话(说了什么)
                输入框.value = ''
            }
        }
    })
    输入框.addEventListener('keypress', function (ev) {
        if (ev.key == 'Enter') {
            ev.preventDefault()
        }
    })
    改名按钮.addEventListener('click', function (ev) {
        let 新名字 = prompt('请输入新的名字')
        if (新名字 != null && 新名字 != '') {
            改名(新名字)
        }
    })
    切换菜单 = popup_list(切换按钮, () => 已加入频道表, function (频道) {
        return create({
            tag: 'a',
            href: (频道 == 当前频道)? null: 'javascript:void(0)',
            textContent: 频道,
            handlers: {
                click: ev => 切换频道(频道)
            }
        })
    })
    切换按钮.addEventListener('click', function(ev) {
        ev.stopPropagation()
        切换菜单.toggle()
    })
    加入菜单 = popup_list(加入按钮, () => 频道列表, function (频道) {
        if (!已加入频道表.has(频道.名称)) {
            return create({
                tag: 'a',
                href: 'javascript:void(0)',
                textContent: 频道.名称,
                handlers: {
                    click: ev => 发送消息(
                        { 命令: '加入频道', 频道: 频道.名称 }
                    )
                }
            })
        }
    })
    加入按钮.addEventListener('click', function (ev) {
        ev.stopPropagation()
        加入菜单.toggle()
    })
    退出按钮.addEventListener('click', function (ev) {
        if (当前频道) {
            发送消息({ 命令: '退出频道', 频道: 当前频道 })
        }
    })
    创建按钮.addEventListener('click', function (ev) {
        let 频道名 = prompt('请输入频道名称')
        if (频道名 !== null) {
            let 主题 = prompt('请输入讨论主题')
            if (主题 !== null) {
                发送消息({ 命令: '创建频道', 频道名: 频道名, 主题: 主题 })
            }
        }
    })
}


window.addEventListener('DOMContentLoaded', init)
