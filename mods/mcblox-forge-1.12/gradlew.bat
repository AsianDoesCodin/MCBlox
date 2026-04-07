@rem
@rem Gradle startup script for Windows
@rem

@if "%DEBUG%"=="" @echo off

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if %ERRORLEVEL% equ 0 goto execute
goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe
if exist "%JAVA_EXE%" goto execute
goto fail

:execute
@rem Setup the command line
set CLASSPATH=%DIRNAME%\gradle\wrapper\gradle-wrapper.jar

"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with Windows NT shell
if %ERRORLEVEL% equ 0 goto mainEnd

:fail
echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
exit /b 1

:mainEnd
exit /b %ERRORLEVEL%
