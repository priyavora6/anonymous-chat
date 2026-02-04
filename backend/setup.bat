@echo off
REM Setup script for anonymous-chat backend

echo Creating virtual environment...
python -m venv .venv

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Installing requirements...
pip install -r requirements.txt --upgrade

echo Initializing database...
python -m app.init_db

echo.
echo ✅ Setup complete!
echo.
echo To start the server, run:
echo   .venv\Scripts\activate.bat
echo   python -m app.main
