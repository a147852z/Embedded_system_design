import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET', 'dev-secret-for-local')

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

WSGI_APPLICATION = 'backend.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# 1. 允許任何主機連線 (包含 localhost, 區域網路 IP, 外部 IP)
ALLOWED_HOSTS = ['*']

# 2. CORS 設定：允許所有來源 (最寬鬆模式)
CORS_ALLOW_ALL_ORIGINS = True

# 注意：當設為 True 時，CORS_ALLOWED_ORIGINS (白名單) 會失效，所以可以註解掉
# CORS_ALLOWED_ORIGINS = [...] 

# 3. 允許跨域傳送 Cookies (如 Session ID)
# 雖然 CORS 開全了，但如果要傳 Cookies，這個還是得開
CORS_ALLOW_CREDENTIALS = True

# 4. CSRF 設定 (這是 POST 請求能否成功的關鍵！)
# 雖然 CORS 允許所有，但 Django 的 CSRF 保護不支援 '*' (萬用字元)。
# 你必須把你終端機顯示出來的「Network」網址都填進去。
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    
    # 根據你的截圖，這兩個是你目前的內網 IP，都加進去以免換網路連不到
    "http://192.168.178.151:3000",
    "http://192.168.50.233:3000",
]