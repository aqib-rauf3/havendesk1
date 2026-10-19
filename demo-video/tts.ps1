param(
  [Parameter(Mandatory=$true)][string]$WavPath,
  [Parameter(Mandatory=$true)][string]$Text
)

Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 0
$s.SetOutputToWaveFile($WavPath)
$s.Speak($Text)
$s.Dispose()
