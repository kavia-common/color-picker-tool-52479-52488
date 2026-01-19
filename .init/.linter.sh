#!/bin/bash
cd /home/kavia/workspace/code-generation/color-picker-tool-52479-52488/color_picker_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

