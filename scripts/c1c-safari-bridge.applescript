-- Prepared only. No cookies, existing documents, history, JavaScript or System Events.
-- The operator must attest that Safari's front window is a NEW private test window.
use scripting additions
on run argv
 if (count argv) < 1 then return "ERROR_ARGUMENTS"
 set operation to item 1 of argv
 if operation is "ready" then
  if (count argv) is not 2 and (count argv) is not 3 then return "ERROR_ARGUMENTS"
  if item 2 of argv is not "PRIMARY" and item 2 of argv is not "SECONDARY" then return "ERROR_ARGUMENTS"
  set preparationNote to ""
  if (count argv) is 3 then
   if item 3 of argv is not "WINDOW_NOT_READY" then return "ERROR_ARGUMENTS"
   set preparationNote to "Window setup is paused; no Google login has started for this account. The prepared Safari window was not available with one tab. Open a NEW private Safari window before clicking Start. "
  end if
  display dialog preparationNote & "Open a NEW private Safari window for the approved " & item 2 of argv & " account. It must contain one empty tab and no existing MFD session. Leave that Safari window in front of your other Safari windows. Click Start when ready. The helper will navigate and read ONLY that test tab; no callback copying is needed." buttons {"Cancel", "Start"} default button "Start" cancel button "Cancel" with title "MFD staging acceptance"
  return "READY_PRIVATE"
 end if
 if application "Safari" is not running then return "ERROR_NOT_RUNNING"
 tell application "Safari"
  if operation is "pair" then
   if (count windows) is 0 then return "ERROR_WINDOW"
   if (count tabs of front window) is not 1 then return "ERROR_TABS"
   -- Capture an identifier only; do NOT read an existing URL/title/document.
   return (id of front window) as text
  end if
  if (count argv) < 2 then return "ERROR_ARGUMENTS"
  set windowID to (item 2 of argv) as integer
  if not (exists window id windowID) then return "ERROR_WINDOW"
  set targetWindow to window id windowID
  if (count tabs of targetWindow) is not 1 then return "ERROR_TABS"
  if operation is "smoke" then
   set URL of tab 1 of targetWindow to "data:text/html,<title>MFD%20local%20test</title><p>C1C_LOCAL_SMOKE_ONLY</p>"
   return "SMOKE_STARTED"
  else if operation is "smoke_status" then
   set localURL to URL of tab 1 of targetWindow
   if localURL does not start with "data:text/html," then return "NOT_READY"
   if localURL does not contain "C1C_LOCAL_SMOKE_ONLY" then return "ERROR_CHANGED"
   if (source of tab 1 of targetWindow) contains "C1C_LOCAL_SMOKE_ONLY" then return "SMOKE_OK"
   return "NOT_READY"
  end if
  if operation is "navigate" then
   if (count argv) is not 3 then return "ERROR_ARGUMENTS"
   set URL of tab 1 of targetWindow to item 3 of argv
   return "NAVIGATED"
  else if operation is "url" then
   return URL of tab 1 of targetWindow
  else if operation is "callback" then
   set beforeURL to URL of tab 1 of targetWindow
   if beforeURL does not start with "https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback?code=" then return "ERROR_CALLBACK"
   -- HTML never leaves this process. Only the fixed diagnostic marker is returned.
   set pageSource to source of tab 1 of targetWindow
   set afterURL to URL of tab 1 of targetWindow
   if beforeURL is not afterURL then return "ERROR_CHANGED"
   if pageSource contains "Diagnostic: CB_TRANSACTION_REQUIRED" then
    return beforeURL & linefeed & "EXPECTED_CALLBACK"
   else if pageSource contains "Diagnostic: CB_" then
    return "ERROR_CALLBACK"
   end if
   return "NOT_READY"
  else if operation is "close" then
   close targetWindow
   return "CLOSED"
  end if
 end tell
 return "ERROR_ARGUMENTS"
end run
