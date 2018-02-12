#!/bin/bash

export PROJECT_NAME="valis"
export PROJECT_ID="valis-194104"
export CLUSTER_NAME="cluster-sirius"
export CLOUDSDK_COMPUTE_ZONE="us-west1-b"


sudo /opt/google-cloud-sdk/bin/gcloud --quiet components update --version 176.0.0
sudo /opt/google-cloud-sdk/bin/gcloud --quiet components update --version 176.0.0 kubectl
echo $GCLOUD_SERVICE_KEY | base64 --decode -i > ${HOME}//gcloud-service-key.json
sudo /opt/google-cloud-sdk/bin/gcloud auth activate-service-account --key-file ${HOME}/gcloud-service-key.json
sudo /opt/google-cloud-sdk/bin/gcloud config set project $PROJECT_ID
sudo /opt/google-cloud-sdk/bin/gcloud --quiet config set container/cluster $CLUSTER_NAME
sudo /opt/google-cloud-sdk/bin/gcloud config set compute/zone ${CLOUDSDK_COMPUTE_ZONE}
sudo /opt/google-cloud-sdk/bin/gcloud --quiet container clusters get-credentials $CLUSTER_NAME

