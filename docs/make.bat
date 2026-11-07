@ECHO OFF

pushd %~dp0

REM Generate user docs first, then build
if "%1" == "html" (
    echo Generating user documentation from source code...
    python ..\scripts\generate_user_docs.py
    if errorlevel 1 (
        echo Error generating user docs.
        exit /b 1
    )
    echo User documentation generated.
    sphinx-build -M html . _build %SPHINXOPTS% %*
    goto end
)

if "%1" == "user-docs" (
    python ..\scripts\generate_user_docs.py
    goto end
)

sphinx-build -M %1 . _build %SPHINXOPTS% %2 %*

:end
popd
