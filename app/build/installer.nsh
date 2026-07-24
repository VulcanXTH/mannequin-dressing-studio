; ===== Mannequin Dressing Studio — custom NSIS hooks =====
;
; ปัญหา: ค่า default ของ electron-builder (_CHECK_APP_RUNNING) สั่งปิดแอปด้วย
;   taskkill /im "..." /fi "PID ne $pid"      <-- ไม่มี /F = ไม่บังคับปิด
; ถ้าแอปไม่ยอมปิดเอง มันจะเด้ง MessageBox
;   "${PRODUCT_NAME} cannot be closed. Please close it manually and click Retry"
; วนไม่จบ ทั้งตอนติดตั้งและตอนถอนการติดตั้ง
;
; วิธีแก้: override macro customCheckAppRunning เพื่อแทนที่การเช็คทั้งหมด
; (electron-builder ใช้ !ifmacrodef customCheckAppRunning ใน CHECK_APP_RUNNING
;  ซึ่งถูกเรียกทั้งจาก installSection.nsh และ uninstaller.nsh)
; เราปิดแอปแบบบังคับเงียบ ๆ แล้วเดินหน้าต่อ — ไม่มี dialog ให้ผู้ใช้ต้องกด Retry อีก
;
; หมายเหตุสำคัญ:
;  - ห้ามใช้ /T (kill tree): เวลาอัปเดตจากปุ่มในแอป ตัวติดตั้งเป็น child ของแอป
;    ถ้าใช้ /T ตัวติดตั้งจะฆ่าตัวเองตายกลางคัน
;  - ไม่ต้องใช้ /T อยู่แล้ว เพราะบน Windows โปรเซสลูกของ Electron (GPU/renderer/
;    utility) ใช้ชื่อ exe เดียวกันทั้งหมด /IM จึงกวาดครบอยู่แล้ว
;  - เรียกผ่าน "$SYSDIR\cmd.exe" เสมอ (แบบเดียวกับ template ของ electron-builder)
;    เพราะ nsExec::Exec ใช้ CreateProcess ตรง ๆ การเรียก taskkill ลอย ๆ อาจไม่เจอ

!macro FORCE_CLOSE_APP
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 1200
  ; ยิงซ้ำเผื่อมีโปรเซสที่เพิ่งถูก spawn ระหว่างรอบแรก
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  ; หน่วงให้ Windows ปล่อย handle ของไฟล์ก่อนเขียนทับ
  Sleep 800
!macroend

; แทนที่การเช็ค "แอปกำลังรัน" ทั้งหมด — ใช้ทั้งตอนติดตั้งและตอนถอน
!macro customCheckAppRunning
  DetailPrint "Force-closing running ${PRODUCT_NAME}..."
  !insertmacro FORCE_CLOSE_APP
!macroend

; ปิดตั้งแต่ .onInit ด้วย (ก่อนทุกอย่างจะเริ่ม)
!macro customInit
  !insertmacro FORCE_CLOSE_APP
!macroend
