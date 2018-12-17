import random
import hashlib
import smtplib
import threading
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


TOKEN_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
SENDER = 'no_reply@foobar.foobar'


def now():
    return datetime.now()


def first(query):
    try:
        return query.__iter__().__next__()
    except StopIteration:
        return None


def gen_token():
    return ''.join(random.choice(TOKEN_CHARS) for i in range(0, 16))


def sha256(string):
    return hashlib.sha256(bytes(string, encoding='utf8')).hexdigest()


def pw_hash(名字, 字串):
    u = ord(sha256(名字)[0]) + 1
    v = ord(sha256(字串)[0]) + 1
    i = 0
    while i < 998 + (u+v) % 233:
        字串 = sha256(名字+字串+str((u*v % 2333)))
        u = ((u*3 + 1)*v + ord(字串[(u+v)%43])) % 2333
        v = ((v*3 + 1)*u + ord(字串[(u+v)%59])) % 2333
        i += u % 2
    s = u*v % 11
    return 字串[s:s+47]


class EmailThread(threading.Thread):
    def __init__(self, to, subject, content):
        msg = MIMEText(content, 'plain')
        msg['Subject'] = subject
        msg['From'] = SENDER
        msg['To'] = to
        self.msg = msg
        threading.Thread.__init__(self)

    def run (self):
        smtp = smtplib.SMTP('localhost')
        smtp.send_message(self.msg)
        smtp.quit()


def send_mail(to, subject, content):
    EmailThread(to, subject, content).start()


