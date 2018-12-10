#!/usr/bin/env python3

import sys
import json
import random
import asyncio
import inspect
import websockets
from functools import wraps
from datetime import datetime
from json.decoder import JSONDecodeError


侦听端口 = 8102
随机名字长度 = 10
默认频道 = '默认频道'
默认频道主题 = 'default channel'


def log(text):
    print(text, file=sys.stderr)


def now():
    return datetime.now().isoformat(' ')


def 生成随机名字():
    def 尝试生成():
        大写字母 = [chr(n) for n in range(ord('A'), ord('Z'))]
        小写字母 = [chr(n) for n in range(ord('a'), ord('z'))]
        数字 = [chr(n) for n in range(ord('0'), ord('9'))]
        可用字符 = 大写字母 + 小写字母 + 数字
        return ''.join(
            [random.choice(可用字符) for i in range(0, 随机名字长度)]
        )
    名字 = 尝试生成()
    while 用户列表.get(名字):
        名字 = 尝试生成()
    return 名字


class 频道:

    def __init__(self, 频道名, 主题):
        self.频道名 = 频道名
        self.主题 = 主题
        self.加入用户列表 = set()

    def 在里面(self, 用户):
        return 用户.名字 in self.加入用户列表

    def 不在里面(self, 用户):
        return not self.在里面(用户)

    def 加入用户(self, 用户):
        self.加入用户列表.add(用户.名字)

    def 移除用户(self, 用户):
        self.加入用户列表.remove(用户.名字)

    def 用户改名(self, 旧名字, 新名字):
        self.加入用户列表.remove(旧名字)
        self.加入用户列表.add(新名字)


class 用户:
    
    def __init__(self, socket, 名字):
        self.socket = socket
        self.登录时间 = now()
        self.名字 = 名字
        self.加入频道列表 = set()
    
    async def 发送消息(self, 消息):
        return await self.socket.send(json.dumps(消息, ensure_ascii=False))
    
    async def 接收消息(self):
        字符串 = await self.socket.recv()
        try:
            return json.loads(字符串)
        except JSONDecodeError:
            return { '命令': '无' } 
    
    async def 消息队列(self):
        while True:
            yield await self.接收消息()

    def 加入频道(self, 频道):
        频道列表[频道].加入用户(self)
        self.加入频道列表.add(频道)
        广播(其它消息.用户列表(频道), 频道)
        广播(通知.新用户加入(self), 频道)

    def 退出频道(self, 频道):
        频道列表[频道].移除用户(self)
        self.加入频道列表.remove(频道)
        广播(其它消息.用户列表(频道), 频道)
        广播(通知.用户退出(self), 频道)

    def 改名(self, 新名字):
        旧名字 = self.名字
        self.名字 = 新名字
        for 频道 in self.加入频道列表:
            频道列表[频道].用户改名(旧名字, 新名字)
            广播(通知.用户改名(旧名字, 新名字), 频道)
            广播(其它消息.用户列表(), 频道)

    def 下线(self):
        for 频道 in self.加入频道列表:
            频道列表[频道].移除用户(self)
            广播(其它消息.用户列表(频道), 频道)
            广播(通知.用户下线(self), 频道)
        self.加入频道列表 = set()
        

用户列表 = {}
频道列表 = { 默认频道: 频道(默认频道, 默认频道主题) }


def 后台执行(操作):
    asyncio.create_task(操作)


def 广播(消息, 频道=None):
    if 频道 is not None:
        for 用户 in [ 用户列表[名字] for 名字 in 频道列表[频道].加入用户列表]:
            后台执行(用户.发送消息( {**消息, '频道': 频道} ))
    else:
        for 用户 in 用户列表.values():
            后台执行(用户.发送消息(消息))
    log(f"【{消息['类型']}】({频道}) {repr(消息['内容'])}")


def 封装消息(类型):
    def decorator(f):
        @wraps(f)
        def g(*args, **kwargs):
            消息内容 = f(*args, **kwargs)
            return { '类型': 类型, '内容': 消息内容 }
        return g
    return decorator


说话消息 = 封装消息('说话')
通知消息 = 封装消息('通知')
反馈消息 = 封装消息('反馈')
确认消息 = 封装消息('确认')
频道列表消息 = 封装消息('频道列表')
用户列表消息 = 封装消息('用户列表')
名字更新消息 = 封装消息('名字更新')


class 聊天:
    @说话消息
    def 说话(谁, 说了什么):
        return {'谁': 谁, '说了什么': 说了什么}


class 通知:
    @通知消息
    def 新用户加入(用户):
        return f'用户 {用户.名字} 加入了聊天'
    @通知消息
    def 用户退出(用户):
        return f'用户 {用户.名字} 退出了聊天'
    @通知消息
    def 用户改名(旧名字, 新名字):
        return f'用户 {旧名字} 已改名为 {新名字}'
    @通知消息
    def 用户下线(用户):
        return f'用户 {用户.名字} 已下线'


class 反馈:
    
    @反馈消息
    def 欢迎消息(新用户):
        return f'欢迎来到聊天室! 你现在的名字是 {新用户.名字}'
    
    class 改名:
        @反馈消息
        def 重名(新名字):
            return f'名字 {新名字} 正在被其它人使用'
        @反馈消息
        def 不合法(新名字):
            return f'名字 {新名字} 不合法'
        @反馈消息
        def 缺少名字():
            return f'请输入新的名字'
        @反馈消息
        def 成功():
            return f'名字更改成功'

    class 说话:
        @反馈消息
        def 什么也没说():
            return f'请输入说话内容'

    class 频道:
        @反馈消息
        def 已存在(频道):
            return f'频道已存在: {频道} '
        @反馈消息
        def 不存在(频道):
            return f'频道不存在: {频道}'
        @反馈消息
        def 已加入(频道):
            return f'您已经加入了频道: {频道}'
        @反馈消息
        def 未加入(频道):
            return f'您并未加入频道: {频道}'
        @反馈消息
        def 创建成功(频道):
            return f'成功创建频道: {频道}'
        @反馈消息
        def 缺少名称(频道):
            return f'请输入频道名称'


class 消息确认:
    @确认消息
    def 收到说话消息(序号):
        return {'确认什么': '收到说话消息', '序号': 序号}
    @确认消息
    def 创建成功(频道):
        return {'确认什么': '成功创建频道', '频道': 频道}
    @确认消息
    def 退出成功(频道):
        return {'确认什么': '成功退出频道', '频道': 频道}
    @确认消息
    def 加入成功(频道):
        return {
            '确认什么': '成功加入频道',
            '频道': 频道,
            '主题': 频道列表[频道].主题
        }


class 其它消息:
    @频道列表消息
    def 频道列表():
        return [{'名称':c.频道名, '主题':c.主题} for c in 频道列表.values()]
    @用户列表消息
    def 用户列表(频道):
        return list(频道列表[频道].加入用户列表)
    @名字更新消息
    def 名字更新(新名字):
        return 新名字


class 执行命令:

    async def 频道列表(用户):
        await 用户.发送消息(其它消息.频道列表())

    async def 创建频道(用户, 频道名, 主题):
        if 频道名 == '':
            await 用户.发送消息(反馈.频道.缺少名称())
            return
        if 频道列表.get(频道名):
            await 用户.发送消息(反馈.频道.已存在(频道名))
            return
        频道列表[频道名] = 频道(频道名, 主题)
        await 用户.发送消息(消息确认.创建成功(频道名))
        await 用户.发送消息(反馈.频道.创建成功(频道名))

    async def 加入频道(用户, 频道):
        if 频道列表.get(频道) is None:
            await 用户.发送消息(反馈.频道.不存在(频道))
            return
        if 频道列表[频道].在里面(用户):
            await 用户.发送消息(反馈.频道.已加入(频道))
            return
        用户.加入频道(频道)
        await 用户.发送消息(消息确认.加入成功(频道))

    async def 退出频道(用户, 频道):
        if 频道列表.get(频道) is None:
            await 用户.发送消息(反馈.频道.不存在(频道))
            return
        if 频道列表[频道].不在里面(用户):
            await 用户.发送消息(反馈.频道.未加入(频道))
            return
        用户.退出频道(频道)
        await 用户.发送消息(消息确认.退出成功(频道))
    
    async def 改名(用户, 新名字):
        if 新名字 == '':
            await 用户.发送消息(反馈.改名.缺少名字())
            return
        if 用户列表.get(新名字):
            await 用户.发送消息(反馈.改名.重名(新名字))
            return
        if 新名字.find(' ') != -1:
            await 用户.发送消息(反馈.改名.不合法(新名字))
            return
        旧名字 = 用户.名字
        用户.改名(新名字)
        用户列表[新名字] = 用户列表.pop(旧名字)
        await 用户.发送消息(其它消息.名字更新(新名字))
        await 用户.发送消息(反馈.改名.成功())
    
    async def 说话(用户, 频道, 序号, 说了什么):
        if 说了什么:
            if 频道列表.get(频道) and 频道列表[频道].在里面(用户):
                广播(聊天.说话(用户.名字, 说了什么), 频道)
                await 用户.发送消息(消息确认.收到说话消息(序号))
        else:
            await 用户.发送消息(反馈.说话.什么也没说())


def 登录用户(socket, 名字):
    新用户 = 用户(socket, 名字)
    用户列表[名字] = 新用户
    return 新用户


def 注销用户(用户):
    名字 = 用户.名字
    用户.下线()
    用户列表.pop(名字)


async def 柜台(socket, url):
    用户 = 登录用户(socket, 生成随机名字())
    await 用户.发送消息(反馈.欢迎消息(用户))
    await 用户.发送消息(其它消息.名字更新(用户.名字))
    try:
        async for 消息 in 用户.消息队列():   
            命令 = 消息.get('命令', '')
            if hasattr(执行命令, 命令):
                p = inspect.getfullargspec(getattr(执行命令, 命令)).args
                argument = {}
                for parameter in p:
                    argument[parameter] = 消息.get(parameter, '')
                argument['用户'] = 用户
                await (getattr(执行命令, 命令))(**argument)
    finally:
        注销用户(用户)


def 启动服务器():
    事件循环 = asyncio.get_event_loop()
    事件循环.run_until_complete(websockets.serve(柜台, '127.0.0.1', 侦听端口))
    事件循环.run_forever()


def main():
    if sys.version_info < (3,7):
        print('This script requires python >= 3.7')
        return
    启动服务器()


if __name__ == '__main__':
    main()
