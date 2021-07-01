const express = require('express');
const app = express();
const axios = require('axios').default;
const { CloudEvent, Emitter, HTTP } = require('cloudevents')

const slackURL = process.env.SLACK_URL;
const port = process.env.PORT || 8080;

const ONE_HOUR = 1000 * 60 * 60  // ms * seconds * minutes
const completedWithinLastHour = (event) => {
  let response = true;
  const status = event.data.pipelineRun ? event.data.pipelineRun.status : event.data.taskRun.status;
  if(status && status.completionTime){
     console.log(`Completed time: ${status.completionTime}`);
    let completedDateTime = new Date(status.completionTime);
    response = completedDateTime > Date.now() - ONE_HOUR;
  }
  console.log(`Completed within last hour: ${response}`);
  return response;
};

const formatSlackMessage = (event) => {

  let messageText;
  if (event.type && event.type.search('successful') >=0 ){
    messageText = ':white_check_mark: *PASSED* \n'
  } else if (event.type && event.type.search('failed') >=0 ){
    messageText = ':X: *FAILED* \n'
  } else {
    messageText = ':question: *UNKNOWN* \n'
  }

  const metadata = event.data.pipelineRun ? event.data.pipelineRun.metadata : event.data.taskRun.metadata;
  const runType =  event.data.pipelineRun ? 'PipelineRun' : 'TaskRun';
  messageText += `${runType}: _${metadata.name}_\nNamespace: _${metadata.namespace}_`;

  if (metadata.labels){
    messageText +=  "\nlabels:\n>" + JSON.stringify(metadata.labels).replace(/\,/g, ',\n>');
  }
  if (metadata.ownerReferences){
    messageText +=  "\nowner\n>" + JSON.stringify(metadata.ownerReferences).replace(/\,/g, ',\n>');
  }

  return {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": messageText
        }
      }
    ]
  }
}

const postSlack = (message) => {
  //const body = {"text": message};
  const header = {
    "Content-type": "application/json"
  };

  axios({
    method: 'post',
    url: slackURL,
    data: message,
    headers: header,
  })
    .then((responseSlack) => {
      console.log(`SLACK response status: ${responseSlack.status}`)
    })
    .catch(console.error)
};


// body parser for POST
app.use((req, res, next) => {
  let data = ''
  req.setEncoding('utf8')
  req.on('data', function (chunk) {
    data += chunk
  })
  req.on('end', function () {
    req.body = data
    next()
  })
});

app.post('/', (req, res) => {
  try {
    console.log(`Received a request on: ${new Date().toISOString()}`);
    const event = HTTP.toEvent({headers: req.headers, body: req.body});
    console.log(`Event type: ${event.type}`);
    if(completedWithinLastHour(event)){
      postSlack(formatSlackMessage(event));
    };
    res.send("OK");
  } catch (err) {
    console.error(err)
    res.status(415)
      .header('Content-Type', 'application/json')
      .send(JSON.stringify(err))
  }
});

app.get('/', (req, res) => {
  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log('Slack Notifications listening on port', port);
});

