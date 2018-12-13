#!/usr/bin/env python3


from peewee import *
from datetime import datetime


db = SqliteDatabase('data.db')


class BaseModel(Model):
    class Meta:
        database = db


class 聊天记录(BaseModel):
    时间 = DateTimeField()
    类型 = CharField()
    频道 = TextField()
    用户 = TextField()
    内容 = TextField()


tables = [聊天记录]


class 数据库操作:
    def 加入记录(记录):
        聊天记录.create(时间=datetime.now(), **记录)
    
    
def init_db():
    print('Creating tables ...')
    db.create_tables(tables)
    print('done.')


if __name__ == '__main__':
    init_db()
