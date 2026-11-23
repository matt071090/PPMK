param([Parameter(Mandatory=$true)][string]$PageId,[ValidateSet('before','after')][string]$Stage='before')
$ErrorActionPreference='Stop'
$artifactDir=Join-Path $PSScriptRoot '../../docs/qa-wbi/screenshots'
New-Item -ItemType Directory -Force $artifactDir | Out-Null
$pages=[ordered]@{home='home.html';setup='setup.html#/warehouses';schedule='schedule.html';countdoc='countdoc.html';rpt='rpt.html';hana='hana.html';index='index.html'}
$results=@()
foreach($entry in $pages.GetEnumerator()) {
    foreach($size in @(@{name='desktop';width=1440;height=1000},@{name='mobile';width=390;height=844})) {
        $nav=orca goto --page $PageId --url ('http://127.0.0.1:18635/'+$entry.Value) --json | ConvertFrom-Json
        if(!$nav.ok){throw ($nav.error | ConvertTo-Json -Compress)}
        $vp=orca viewport --page $PageId --width $size.width --height $size.height --json | ConvertFrom-Json
        if(!$vp.ok){throw ($vp.error | ConvertTo-Json -Compress)}
        # Fixtures only; choose source and clear transient user data for comparable screenshots.
        $state=orca eval --page $PageId --expression "localStorage.setItem('wbi:setup-src','same:DEMO_SOURCE'); localStorage.setItem('wbi:setup-way:warehouses','db'); document.documentElement.dataset.theme='light'; window.scrollTo(0,0); true" --json | ConvertFrom-Json
        if(!$state.ok){throw ($state.error | ConvertTo-Json -Compress)}
        if($entry.Key -eq 'setup') {
            $reloaded=orca reload --page $PageId --json | ConvertFrom-Json
            $vp=orca viewport --page $PageId --width $size.width --height $size.height --json | ConvertFrom-Json
        }
        $shot=orca screenshot --page $PageId --json | ConvertFrom-Json
        if(!$shot.ok){throw ($shot.error | ConvertTo-Json -Compress)}
        $name=$Stage+'-'+$entry.Key+'-'+$size.name+'.png'
        Copy-Item -LiteralPath $shot.result.path -Destination (Join-Path $artifactDir $name)
        $audit=orca eval --page $PageId --expression "({title:document.title,company:document.documentElement.dataset.company||'',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,errors:document.querySelectorAll('.error').length})" --json | ConvertFrom-Json
        if(!$audit.ok){throw ($audit.error | ConvertTo-Json -Compress)}
        $results+=@{file=$name;audit=$audit.result}
        Write-Output $name
    }
}
$results | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 (Join-Path $artifactDir ($Stage+'-manifest.json'))
