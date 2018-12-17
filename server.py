#!/usr/bin/env python3


import re
import sys
import json
import random
import asyncio
import inspect
import websockets
from datetime import datetime
from json.decoder import JSONDecodeError
from concurrent.futures import ThreadPoolExecutor
from database import 数据库操作
from message import *
import message


侦听端口 = 8102
聊天记录请求上限 = 300
随机名字长度 = 10
随机名字模式 = re.compile('[A-Za-z0-9]{%d}' % 随机名字长度)
db_executor = ThreadPoolExecutor(max_workers=1)


def log(text):
    print(text, file=sys.stderr)


def now():
    return datetime.now().isoformat(' ')


async def 操作数据库(f):
    return await asyncio.get_event_loop().run_in_executor(db_executor, f)


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
        用户列表[新名字] = 用户列表.pop(旧名字)
        for 频道 in self.加入频道列表:
            频道列表[频道].用户改名(旧名字, 新名字)
            广播(通知.用户改名(旧名字, 新名字), 频道)
            广播(其它消息.用户列表(频道), 频道)

    def 下线(self):
        for 频道 in self.加入频道列表:
            频道列表[频道].移除用户(self)
            广播(其它消息.用户列表(频道), 频道)
            广播(通知.用户下线(self), 频道)
        self.加入频道列表 = set()
        

用户列表 = {}
频道列表 = {}


message.频道列表 = lambda: 频道列表


def 后台执行(操作):
    asyncio.create_task(操作)


def 记录消息(消息, 频道):
    需要记录 = ['说话', '发图', '通知']
    class 记录内容:
        def 说话(消息):
            return {
                '类型': '说话',
                '频道': 频道,
                '用户': 消息['内容']['谁'],
                '内容': 消息['内容']['说了什么']
            }
        def 发图(消息):
            return {
                '类型': '发图',
                '频道': 频道,
                '用户': 消息['内容']['谁'],
                '内容': 消息['内容']['发了什么']
            }
        def 通知(消息):
            return {
                '类型': '通知',
                '频道': 频道,
                '用户': '',
                '内容': 消息['内容']
            }
    def 存入记录():
        数据库操作.写入记录(getattr(记录内容, 消息['类型'])(消息))
    if 消息['类型'] in 需要记录:
        后台执行(操作数据库(存入记录))


def 广播(消息, 频道=None):
    if 频道 is not None:
        for 用户 in [ 用户列表[名字] for 名字 in 频道列表[频道].加入用户列表]:
            后台执行(用户.发送消息( {**消息, '频道': 频道} ))
    else:
        for 用户 in 用户列表.values():
            后台执行(用户.发送消息(消息))
    记录消息(消息, 频道)
    log(f"【{消息['类型']}】({频道}) {repr(消息['内容'])}")


class 执行命令:

    #  注: 每个消息处理函数中只允许进行一次异步数据库操作,
    #      并且该次操作之后之应立即执行涉及状态改变的同步操作.

    async def 频道列表(用户):
        await 用户.发送消息(其它消息.频道列表())

    async def 聊天记录(用户, 频道名, 数量):
        try:
            数量 = int(数量)
        except ValueError:
            return
        if 数量 <= 0:
            return
        if 数量 > 聊天记录请求上限:
            await 用户.发送消息(反馈.记录.请求过多(聊天记录请求上限))
            return
        if 频道列表.get(频道名) is None:
            await 用户.发送消息(反馈.频道.不存在(频道名))
            return
        if 频道列表[频道名].不在里面(用户):
            await 用户.发送消息(反馈.频道.未加入(频道名))
            return
        记录表 = await 操作数据库(lambda: 数据库操作.读取记录(频道名, 数量))
        for 记录 in 记录表:
            await 用户.发送消息(其它消息.聊天记录(频道名, 记录))

    async def 更改主题(用户, 频道名, 新主题):
        if 频道列表.get(频道名) is None:
            await 用户.发送消息(反馈.频道.不存在(频道名))
            return
        if 频道列表[频道名].不在里面(用户):
            await 用户.发送消息(反馈.频道.未加入(频道名))
            return
        await 操作数据库(lambda: 数据库操作.更改主题(频道名, 新主题))
        频道列表[频道名].主题 = 新主题
        广播(其它消息.频道列表())
        广播(通知.主题更改(用户, 新主题), 频道名)
        await 用户.发送消息(消息确认.更改成功(频道名, 新主题))
        await 用户.发送消息(反馈.频道.更改成功())

    async def 创建频道(用户, 频道名, 主题):
        if 频道名 == '':
            await 用户.发送消息(反馈.频道.缺少名称())
            return
        if 频道列表.get(频道名):
            await 用户.发送消息(反馈.频道.已存在(频道名))
            return
        await 操作数据库(lambda: 数据库操作.添加频道({
            '名称': 频道名, '主题': 主题
        }))
        频道列表[频道名] = 频道(频道名, 主题)
        广播(其它消息.频道列表())
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

    async def 登入(用户, 名字, 密码):
        尝试 = await 操作数据库(lambda: 数据库操作.尝试登入(名字, 密码))
        if 尝试['结果'] == '失败':
            await 用户.发送消息( (getattr(反馈.登入, 尝试['失败原因']))() )
        else:
            用户.改名(名字)
            await 用户.发送消息(其它消息.名字更新(名字, '已登入'))
            await 用户.发送消息(反馈.登入.成功())

    async def 注册(用户, 邮箱, 密码):
        名字 = 用户.名字
        if 随机名字模式.fullmatch(名字):
            await 用户.发送消息(反馈.注册.随机名字())
            return
        尝试 = await 操作数据库(lambda: 数据库操作.注册用户(名字, 邮箱, 密码))
        if 尝试['结果'] == '失败':
            if 尝试['失败原因'] == '邮箱重复':
                await 用户.发送消息(反馈.注册.邮箱重复(邮箱))
                return
            elif 尝试['失败原因'] == '已注册':
                await 用户.发送消息(反馈.注册.已注册(用户.名字))
                return                
        await 用户.发送消息(反馈.注册.成功(邮箱))
        await 用户.发送消息(消息确认.注册成功())

    async def 激活(用户, 令牌值):
        名字 = 用户.名字
        if await 操作数据库(lambda: 数据库操作.激活用户(名字, 令牌值)):
            await 用户.发送消息(反馈.激活.成功())
        else:
            await 用户.发送消息(反馈.激活.失败())
    
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
        名字信息 = await 操作数据库(lambda: 数据库操作.名字信息(新名字))
        if 名字信息['注册状态'] == '已注册':
            await 用户.发送消息(反馈.改名.已注册(新名字))
            return
        用户.改名(新名字)
        await 用户.发送消息(其它消息.名字更新(新名字, '未登入'))
        await 用户.发送消息(反馈.改名.成功())
    
    async def 说话(用户, 频道, 序号, 说了什么):
        if 说了什么:
            if 频道列表.get(频道) and 频道列表[频道].在里面(用户):
                广播(聊天.说话(用户.名字, 说了什么), 频道)
                await 用户.发送消息(消息确认.收到说话消息(序号))
        else:
            await 用户.发送消息(反馈.聊天.什么也没说())

    async def 发图(用户, 频道, 序号, 图片):
        if 图片: # TODO: check
            if 频道列表.get(频道) and 频道列表[频道].在里面(用户):
                广播(聊天.发图(用户.名字, 图片), 频道)
                await 用户.发送消息(消息确认.收到图片消息(序号))
        else:
            await 用户.发送消息(反馈.聊天.图片不合法())


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
    await 用户.发送消息(其它消息.名字更新(用户.名字, '未登入'))
    await 用户.发送消息(其它消息.频道列表())
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


def 读入频道列表():
    global 频道列表
    频道列表 = {
        c.名称: 频道(c.名称, c.主题)
        for c in 数据库操作.读取频道表()
    }


def 启动服务器():
    事件循环 = asyncio.get_event_loop()
    事件循环.run_until_complete(
        websockets.serve(柜台, '127.0.0.1', 侦听端口, max_size=9*1024*1024)
    )
    事件循环.run_forever()


def main():
    if sys.version_info < (3,7):
        print('This script requires python >= 3.7')
        return
    读入频道列表()
    启动服务器()


if __name__ == '__main__':
    main()
