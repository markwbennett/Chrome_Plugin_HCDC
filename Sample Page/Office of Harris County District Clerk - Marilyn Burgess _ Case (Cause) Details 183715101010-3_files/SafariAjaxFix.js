//referenced in this forums discussion http://forums.asp.net/t/1252014.aspx
Sys.Browser.WebKit = {}; //Safari 3 is considered WebKit
if( navigator.userAgent.indexOf( 'WebKit/' ) > -1 )
{
  Sys.Browser.agent = Sys.Browser.WebKit;
  Sys.Browser.version = parseFloat( navigator.userAgent.match(/WebKit\/(\d+(\.\d+)?)/)[1]);
  Sys.Browser.name = 'WebKit';
}