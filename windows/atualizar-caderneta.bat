@echo off
rem Atualiza a Caderneta agora (busca versao nova no GitHub).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar-caderneta.ps1" %*
pause
