Projekti përbëhet nga dy skripta: serveri TCP dhe klienti TCP.
Serveri ofron autentikim, lista skedarësh, lexim, shkarkim, kërkim, informata të skedarëve, si dhe ngarkim dhe fshirje vetëm për adminin. Klienti lidhet me serverin dhe i dërgon komandat.

Serveri
Serveri nis një port TCP dhe pret derisa të lidhen klientët. Lejon maksimumi gjashtë lidhje aktive.
Çdo përdorues duhet të autentikohet me AUTH <username> <password>.
Serveri ruan përdoruesit e lejuar, rolet e tyre dhe statistikat e trafikut. Administratorët mund të ngarkojnë dhe fshijnë skedarë.
Përdoruesit normalë mund të shikojnë listat, të lexojnë, shkarkojnë dhe kërkojnë skedarë. Skedarët ruhen në direktoriumin server_files.
Serveri mbyll automatikisht lidhjen pas dy minutash pa aktivitet. Çdo mesazh i ardhur apo dërguar regjistrohet dhe statistikat shkruhen periodikisht në server_stats.txt.


Klienti
Klienti lidhet me serverin në HOST dhe PORT të caktuar. Mund të jepen kredencialet direkt në nisje me parametrat --user dhe --pass.
Nëse nuk jepen, përdoruesi duhet të shkruajë AUTH manualisht. Klienti merr përgjigjet nga serveri, i shfaq ato në ekran dhe menaxhon formatet speciale si FILE_CONTENT dhe DOWNLOAD. 
Klienti mund të përdorë të gjitha komandat që serveri i pranon, varësisht nga roli i përdoruesit.
