#!/bin/bash 

instructions() {
  echo "To use this program you need to create a GitHub Personal Access Token

Click on the link below to create one and paste it when prompted: 

https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
  echo ""
}

setEnv () {
  filename=".env"
  read -p "Enter token: " token 
  touch $filename
  echo "token=${token}" > $filename
}

instructions
setEnv
