const DEFAULT_URL = 'ws://127.0.0.1:8102'
const 图片大小上限 = 3*1024*1024


var ws_url = ''
var socket = null
var 名字 = ''
var 登入状态 = '未登入'
var 频道列表 = []
var 用户列表 = {}
var 已加入频道表 = new Set()
var 当前频道 = ''
var 滚动位置 = {}
var 占有焦点 = true
var 切换菜单 = null
var 加入菜单 = null


function is_scrolled_to_bottom (view) {
    return view.scrollTop == (
        view.scrollTopMax || ( view.scrollHeight - view.offsetHeight )
    )
}


function scroll_to_bottom (view) {
    view.scrollTop = view.scrollTopMax || (
        view.scrollHeight - view.offsetHeight
    )
}


function get_color (str) {
    let t = 1
    let u = 0
    for ( let code of map(str, c => c.codePointAt(0)) ) {
        t *= (10*code + u) % 1e10
        u += (10*code * t) % 1e10
    }
    return `hsl(${(t+u) % 357}, ${41 + (t % 43)}%, ${13 + (u % 33)}%)`
}


function init_notification () {
    Notification && Notification.requestPermission().then(function(result) {
        console.log(result);
    })
}


function notify (title, content) {
    if ( Notification && !占有焦点 ) {
        new Notification(title, { body: content, icon: 'chat.png' })
    }
}


function 更新名字 (新名字) {
    名字 = 新名字
    名字提示.textContent = 新名字
}


function 更新登入状态 (状态) {
    登入状态 = 状态
    设定界面.登入状态更新()
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
        handlers: { click: ev => 输入框.insert(`@${名字}`) },
        textContent: 名字
    })))
}


function 清空用户列表 () {
    用户数量视图.textContent = ''
    clear(用户列表视图)
}


let 消息视图 = {
    反馈: function (参数) {
        // ([收到时间], 内容)
        return create({
            tag: 'message',
            dataset: { 消息类型: '反馈' },
            children: [
                参数.收到时间
                    && { tag: 'recv-time', textContent: `(${参数.收到时间})` }
                    || null,
                { tag: 'info', textContent: 参数.内容 }
            ]
        })
    },
    通知: function (参数) {
        // (收到时间, 内容, 频道, [是否高亮])
        return create({
            tag: 'message',
            dataset: {
                消息类型: '通知',
                频道: 参数.频道,
                是否高亮: 参数.是否高亮? true: null
            },
            children: [
                { tag: 'recv-time',
              textContent: `(${参数.收到时间})` },
                { tag: 'info', textContent: 参数.内容 }
            ]
        })
    },
    说话: function (参数) {
        // (什么时候, 谁, 在哪, 说了什么, [有没有被提到])
        let 颜色 = get_color(参数.谁)
        return create({
            tag: 'message',
            dataset: {
                频道: 参数.在哪,
                消息类型: '说话',
                是否高亮: 参数.有没有被提到? true: null
            },
            children: [
                { tag: 'recv-time', textContent: `(${参数.什么时候})`,
                  style: { color: 颜色 } },
                { tag: 'say-name', textContent: 参数.谁,
                  style: { color: 颜色 },
                  handlers: { click: ev => 输入框.insert(`@${参数.谁}`) } },
                { tag: 'say-content', textContent: 参数.说了什么 }
            ]
        })
    },
    发图: function (参数) {
        // (什么时候, 谁, 在哪, 发了什么图)
        let 颜色 = get_color(参数.谁)
        let 图片地址 = URL.createObjectURL(
            new Blob([decode(参数.发了什么图)])
        )
        console.log(图片地址)
        return create({
            tag: 'message',
            dataset: { 频道: 参数.在哪, 消息类型: '发图'  },
            children: [
                { tag: 'recv-time', textContent: `(${参数.什么时候})`,
                  style: { color: 颜色 } },
                { tag: 'say-name', textContent: 参数.谁,
                  style: { color: 颜色 },
                  handlers: { click: ev => 输入框.insert(`@${参数.谁}`) } },
                { tag: 'img', src: 图片地址, classList: ['image'],
                  handlers: { load: (参数.在哪 == 当前频道)
                              && is_scrolled_to_bottom(消息列表视图)
                              && (ev => scroll_to_bottom(消息列表视图))
                              || (ev => 0) } }
            ]
        })
    },
    记录: function (参数) {
        let 记录 = 参数.记录
        let 基本视图 = {
            说话: () => 消息视图.说话({
                什么时候: 记录.时间,
                谁: 记录.用户,
                在哪: 记录.频道,
                说了什么: 记录.内容
            }),
            发图: () => 消息视图.发图({
                什么时候: 记录.时间,
                谁: 记录.用户,
                在哪: 记录.频道,
                发了什么图: 记录.内容
            }),
            通知: () => 消息视图.通知({
                收到时间: 记录.时间,
                频道: 记录.频道,
                内容: 记录.内容
            })
        }
        return create({
            tag: 'message',
            dataset: { 频道: 记录.频道, 消息类型: '记录' },
            children: concat([
                create({
                    tag: 'history-tag',
                    textContent: '【记录】'
                })
            ], 基本视图[记录.类型]().children)
        })
    },
    激活入口: function () {
        return create({
            tag: 'message',
            dataset: { 消息类型: '反馈' },
            children: [
                {
                    tag: 'a',
                    href: 'javascript:void(0)',
                    textContent: '收到激活令牌后点击这里激活帐号',
                    handlers: {
                        click: function (ev) {
                            let 令牌值 = prompt('请输入收到的激活令牌')
                            if (令牌值 != null && 令牌值 != '') {
                                激活(令牌值)
                            }
                        }
                    }
                }
            ]
        })
    }
}


let 如何处理消息 = [
    {
        类型: one_of('说话'),
        执行动作: function (消息) {
            let 收到时间 = 消息.收到时间
            let 频道 = 消息.频道
            let 说话用户 = 消息.内容.谁
            let 说了什么 = 消息.内容.说了什么
            let 是否被提到 = (说话用户 != 名字) && 是否提到自己(说了什么)
            渲染消息(消息视图.说话({
                什么时候: 收到时间,
                谁: 说话用户,
                在哪: 频道,
                说了什么: 说了什么,
                有没有被提到: 是否被提到
            }))
            let 被提到 = (是否被提到 == true)
            if (被提到) {
                console.log('notify')
                notify(`${频道}`, `${说话用户}: ${说了什么}`)
            }
            if (被提到 && 频道 != 当前频道) {
                渲染消息(消息视图.通知({
                    收到时间: 收到时间,
                    内容: `${说话用户} 在 ${频道} 提到了你`,
                    频道: 当前频道,
                    是否高亮: true
                }))
            }
        }
    },
    {
        类型: one_of('发图'),
        执行动作: function (消息) {
            let 收到时间 = 消息.收到时间
            let 频道 = 消息.频道
            let 发图用户 = 消息.内容.谁
            let 图片 = 消息.内容.发了什么
            渲染消息(消息视图.发图({
                什么时候: 收到时间,
                谁: 发图用户,
                在哪: 频道,
                发了什么图: 图片
            }))
        }
    },
    {
        类型: one_of('通知', '反馈'),
        执行动作: function (消息) {
            渲染消息(消息视图[消息.类型]({
                收到时间: 消息.收到时间,
                频道: 消息.频道? 消息.频道: null,
                内容: 消息.内容
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
            更新名字(消息.内容.新名字)
            更新登入状态(消息.内容.登入状态)
        }
    },
    {
        类型: one_of('确认'),
        执行动作: function (消息) {
            let 确认动作 = {
                成功加入频道: function () {
                    let 频道 = 消息.内容.频道
                    let 主题 = 消息.内容.主题
                    已加入频道表.add(频道)
                    用户列表[频道] = 消息.内容.用户列表.sort()
                    切换频道(频道)
                    渲染消息(消息视图.反馈({
                        收到时间: 消息.收到时间,
                        内容: `已加入频道: ${频道} ~ ${主题}`
                    }))
                    设定界面.加入或退出频道()
                },
                成功退出频道: function () {
                    let 频道 = 消息.内容.频道
                    已加入频道表.delete(频道)
                    let l = map(已加入频道表, x=>x)
                    let 退回频道 = l[l.length-1]
                    切换频道(退回频道 || '')
                    if (!退回频道) {
                        scroll_to_bottom(消息列表视图)
                    }
                    渲染消息(消息视图.反馈({
                        收到时间: 消息.收到时间,
                        内容: `已退出频道: ${频道}`                      
                    }))
                    设定界面.加入或退出频道()
                },
                成功注册: function () {
                    渲染消息(消息视图.激活入口())
                }
            }
            if( 确认动作.has(消息.内容.确认什么) ) {
                确认动作[消息.内容.确认什么]()
            }
        }
    },
    {
        类型: one_of('频道列表'),
        执行动作: function (消息) {
            频道列表 = 消息.内容
            设定界面.频道表变动()
        }
    },
    {
        类型: one_of('聊天记录'),
        执行动作: function (消息) {
            渲染消息(消息视图.记录({
                记录: 消息.内容
            }))
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


function 有加入频道 () {
    return (当前频道 != '')
}


function 切换频道 (频道) {
    当前频道 = 频道
    频道提示.textContent = 当前频道 || '---'
    if (有加入频道()) {
        inject_style('channel', create_style([
            [[`message[data-频道="${当前频道}"]`], { display: 'block' }],
            [[`message[data-除去频道="${当前频道}"]`], { display: 'none' }]
        ]))
        渲染用户列表()
        if ( 滚动位置[当前频道] ) {
            let r = 滚动位置[当前频道]
            if (r.滚到最后) {
                scroll_to_bottom(消息列表视图)
            } else {
                消息列表视图.scrollTop = r.数值
            }
        } else {
            scroll_to_bottom(消息列表视图)
        }
    } else {
        inject_style('channel', create_style([]))
        清空用户列表()
    }
    设定界面.当前频道改变()
}


function 说话 (说了什么) {
    发送消息({ 命令: '说话', 说了什么: 说了什么, 频道: 当前频道 })
}


function 发图 (数据) {
    发送消息({ 命令: '发图', 图片: 数据, 频道: 当前频道 })
}


function 改名 (新名字) {
    发送消息({ 命令: '改名', 新名字: 新名字 })
}


function 登入 (登入的名字, 密码) {
    发送消息({ 命令: '登入', 名字: 登入的名字, 密码: 密码 })
}


function 注册 (邮箱, 密码) {
    发送消息({ 命令: '注册', 邮箱: 邮箱, 密码: 密码 })
}


function 激活 (令牌值) {
    发送消息({ 命令: '激活', 令牌值: 令牌值 })
}


function 加入频道 (频道) {
    发送消息({ 命令: '加入频道', 频道: 频道 })
}


function 退出当前频道 () {
    发送消息({ 命令: '退出频道', 频道: 当前频道 })
}


function 请求记录 (数量) {
    发送消息({ 命令: '聊天记录', 频道名: 当前频道, 数量: 数量 })
}


function 更改主题 (新主题) {
    发送消息({ 命令: '更改主题', 频道名: 当前频道, 新主题: 新主题 })
}


function 创建频道 (频道名, 主题) {
    发送消息({ 命令: '创建频道', 频道名: 频道名, 主题: 主题 })
}


function 发起连接() {
    let handlers = {
        open: function (ev) {
            console.log('Connected')
            let 已有连接 = (名字 != '')
            if (已有连接) {
                改名(名字)
                map(
                    filter(已加入频道表, 频道 => 频道 != 当前频道),
                    频道 => 加入频道(频道)
                )
                if (当前频道) {
                    加入频道(当前频道)
                }
                已加入频道表.clear()
            } else {
                连接对话框.hide()
            }
            设定界面.已连线()
            切换频道('')
        },
        close: function (ev) {
            console.log('Disconnected')
            function feedback (text) {
                渲染消息(消息视图.反馈({
                    收到时间: null,
                    内容: text
                }))
            }
            let 已有连接 = (名字 != '')
            if (已有连接) {
                feedback('已断线, 3 秒后尝试重连')
                setTimeout(function () {
                    feedback('正在尝试重连')
                    发起连接()
                }, 3000)
            } else {
                连接按钮.enable()
                alert('连接失败')
            }
            设定界面.未连线()
        },
        message: function (ev) {
            console.log(ev.data)
            处理消息(JSON.parse(ev.data))
        }
    }
    socket = new WebSocket(ws_url)
    map(handlers, (event, handler) => socket.addEventListener(event, handler))
}


function 初始化连接对话框 () {
    localStorage.url = localStorage.url? localStorage.url: DEFAULT_URL
    ws_url = localStorage.url
    地址输入.value = ws_url
    let update_url = function () {
        localStorage.url = ws_url = 地址输入.value
    }
    地址输入.addEventListener('keyup', ev => update_url())
    地址输入.addEventListener('change', ev => update_url())
    连接按钮.addEventListener('click', ev => (发起连接(), 连接按钮.disable()))
}


function 初始化选图对话框 () {
    function feedback (text) {
        选图提示.textContent = text
    }
    let 图片数据 = ''
    文件输入.addEventListener('change', function (ev) {
        let f = 文件输入.files[0]
        let reader = new FileReader()
        reader.addEventListener('load', function (ev) {
            let data = ev.target.result
            if (data.byteLength >= 图片大小上限) {
                feedback('文件过大, 请重新选择')
            } else {
                feedback('图片加载成功, 点击发送键发送')
                图片数据 = encode(data)
                发图按钮.disabled = false
            }
        });
        reader.readAsArrayBuffer(f)
        feedback('正在加载图片...')
        发图按钮.disabled = true
    })
    发图按钮.addEventListener('click', function (ev) {
        发图按钮.disabled = true
        文件输入.value = ''
        选图对话框.hide()
        feedback('请选择要发送的图片, 最大 3M')
        发图(图片数据)
    })
}


function 初始化菜单 () {
    切换菜单 = popup_list(切换按钮, () => 已加入频道表, function (频道) {
        return create({
            tag: 'a',
            href: (频道 == 当前频道)? null: 'javascript:void(0)',
            data_item: { enabled: (频道 != 当前频道) },
            textContent: 频道,
            handlers: {
                click: ev => (频道 != 当前频道) && 切换频道(频道)
            }
        })
    })
    加入菜单 = popup_list(加入按钮, () => 频道列表, function (频道) {
        if (!已加入频道表.has(频道.名称)) {
            return create({
                tag: 'a',
                href: 'javascript:void(0)',
                handlers: { click: ev => 加入频道(频道.名称) },
                children: [
                    { tag: 'item-label', textContent: 频道.名称 },
                    { tag: 'item-desc', textContent: 频道.主题 }
                ]
            })
        }
    })
}


let 界面事件绑定 = {
    消息列表视图: {
        scroll: ev => 有加入频道() && 
            (滚动位置[当前频道] = {
                数值: 消息列表视图.scrollTop,
                滚到最后: is_scrolled_to_bottom(消息列表视图)
            })
    },
    输入框: {
        keypress: ev => (ev.key == 'Enter') && ev.preventDefault(),
        keyup: function (ev) {
            if (ev.key == 'Enter') {
                let 说了什么 = 输入框.value.trimRight()
                if (说了什么) {
                    说话(说了什么)
                    输入框.value = ''
                }
            }
        }
    },
    改名按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                let 新名字 = prompt('请输入新的名字')
                if (新名字 != null && 新名字 != '') {
                    改名(新名字)
                }
            }
        }
    },
    登入按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                let 帐号 = prompt('请输入要登录的帐号的名字')
                if (帐号 != null && 帐号 != '') {
                    let 密码 = prompt(`请输入帐号 ${帐号} 的密码`)
                    if (密码 != null && 密码 != '') {
                        登入(帐号, 密码)
                    }
                }
            }
        }
    },
    注册按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                let 邮箱 = prompt('请输入要使用的 Email 地址')
                if (邮箱 != null && 邮箱 != '') {
                    let 密码 = prompt('请设定密码')
                    if (密码 != null && 密码 != '') {
                        注册(邮箱, 密码)
                    }
                }
            }
        }
    },
    选图按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                选图对话框.toggle()
            }
        }
    },
    取消选图按钮: {
        click: ev => 选图对话框.hide()
    },
    切换按钮: {
        click: function(ev) {
            if (this.is_enabled()) {
                ev.stopPropagation()
                切换菜单.toggle()
            }
        }
    },
    加入按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                ev.stopPropagation()
                加入菜单.toggle()
            }
        }
    },
    退出按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                退出当前频道()
            }
        }
    },
    记录按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                let 数量 = parseInt(prompt('请输入所需记录条数 (N < 300)'))
                if ( !Number.isNaN(数量) ) {
                    请求记录(数量)
                }
            }
        }
    },
    主题按钮: {
        click: function (ev) {
            if (this.is_enabled()) {
                let 新主题 = prompt('请输入新的主题')
                if (新主题 !== null) {
                    更改主题(新主题)
                }
            }
        }
    },
    创建按钮: {
        click: function (ev) {
            if (this.is_enabled()) {         
                let 频道名 = prompt('请输入频道名称')
                if (频道名 !== null) {
                    let 主题 = prompt('请输入讨论主题')
                    if (主题 !== null) {
                        创建频道(频道名, 主题)
                    }
                }
            }
        }
    } 
}


function 存在未加入频道 () {
    return (
        filter(
            map(频道列表, c => c.名称),
            名称 => !(已加入频道表.has(名称))
        ).length > 0
    )
}


let 设定界面 = {
    未连线: function () {
        切换按钮.disable()        
        改名按钮.disable()
        登入按钮.disable()
        注册按钮.disable()
        创建按钮.disable()
        选图按钮.disable()
        退出按钮.disable()
        记录按钮.disable()
        主题按钮.disable()
        加入按钮.disable()
        输入框.disable()
    },
    已连线: function () {
        切换按钮.disable()
        改名按钮.enable()
        登入按钮.enable()
        注册按钮.enable()
        创建按钮.enable()
        选图按钮.enable()
        退出按钮.enable()
        记录按钮.enable()
        主题按钮.enable()
    },
    登入状态更新: function () {
        if (登入状态 == '已登入') {
            注册按钮.hide()
            登入按钮.textContent = '切换帐号'
            名字提示.style.fontWeight = 'bold'
        } else {
            注册按钮.show()
            登入按钮.textContent = '登录'
            名字提示.style.fontWeight = 'inherit'
        }
    },
    频道表变动: function () {
        if (存在未加入频道()) {
            加入按钮.enable()
        } else {
            加入按钮.disable()
        }
    },
    加入或退出频道: function () {
        if (存在未加入频道()) {
            加入按钮.enable()
        } else {
            加入按钮.disable()
        }
        if ( 已加入频道表.size > 0 ) {
            切换按钮.enable()
        }
    },
    当前频道改变: function () {
        if (有加入频道()) {
            退出按钮.enable()
            记录按钮.enable()
            主题按钮.enable()
            选图按钮.enable()
            输入框.enable()
        } else {
            切换按钮.disable()
            退出按钮.disable()
            记录按钮.disable()
            主题按钮.disable()
            选图按钮.disable()
            输入框.disable()
        }
    }
}


function init () {
    设定界面.未连线()
    init_notification()
    初始化连接对话框()
    初始化选图对话框()
    初始化菜单()
    window.addEventListener('focus', ev => 占有焦点 = true)
    window.addEventListener('blur', ev => 占有焦点 = false)
    map(界面事件绑定, (ID, handlers) => map(handlers,
        (event, handler) => $(`#${ID}`).addEventListener(event, handler)
    ))
}


window.addEventListener('DOMContentLoaded', init)
