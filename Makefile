default:
	rsync -vzcrptgoD --delete -e "ssh -p 4000" ./ rdmreu1q@rdmr.eu:~/museomix/