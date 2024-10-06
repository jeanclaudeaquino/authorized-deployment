require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const app = express();
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = new twilio(accountSid, authToken);
const bodyParser = require("body-parser");

const port = process.env.PORT || 3000;

// Track approvals
let approvals = {
  "+64274476221": false, // Approver 1
  "+64273814842": false, // Approver 2
};

let smsApproved = false; // Global approval status
let approvalTimeout = null; // Timeout handler for resetting approvals
const approvalTimeoutDuration = 15 * 60 * 1000; // 15 minutes

app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Function to reset approvals
const resetApprovals = () => {
  approvals["+64274476221"] = false;
  approvals["+64273814842"] = false;
  smsApproved = false;
  console.log("Approvals have been reset due to timeout.");
};

// Function to check if both approvals are "yes"
const allApproved = (approvals) =>
  approvals["+64274476221"] && approvals["+64273814842"];

// Function to send appropriate Twilio response
const sendResponse = (res, message) => {
  res.send(`<Response><Message>${message}</Message></Response>`);
};

// Send SMS and start the approval timer
app.post("/send-sms", (req, res) => {
  const date = new Date().toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
  });
  const body = `Your github workflow job for deployment sent request on  ${date} and is waiting for approval. Send "yes" to DEPLOYMENT AGENT to proceed, otherwise send "no"`;
  const from = "+19254758253"; // Twilio number
  const phoneNumbers = ["+64274476221", "+64273814842"];

  // Send SMS to both approvers
  phoneNumbers.forEach((number) => {
    client.messages
      .create({
        body,
        from,
        to: number, // Recipient's phone number
      })
      .then((message) => {
        console.log(`Message sent to ${number}: ${message.sid}`);
      })
      .catch((error) => console.error(`Failed to send to ${number}: ${error}`));
  });

  resetApprovals();
  // Start a timer to reset approvals if no response in 15 minutes
  approvalTimeout = setTimeout(() => {
    resetApprovals();
  }, approvalTimeoutDuration);

  res.status(200).json({ success: true, message: "SMS sent for approval" });
});

// Handle SMS response for approval
app.post("/sms-response", (req, res) => {
  const incomingMessage = req.body.Body.trim().toLowerCase();
  const fromNumber = req.body.From; // Get the number of the person who sent the message

  if (["yes", "no"].includes(incomingMessage)) {
    if (approvals.hasOwnProperty(fromNumber)) {
      // Update approval status for this approver
      approvals[fromNumber] = incomingMessage === "yes";

      // Check if both approvals are "yes"
      if (allApproved(approvals)) {
        smsApproved = true;
        clearTimeout(approvalTimeout); // Clear the timeout since both responses are received
        console.log("Both approvals received.");
      } else {
        smsApproved = false;
      }

      sendResponse(res, "Approval received. Thank you!");
    } else {
      sendResponse(res, "You are not authorized to approve.");
    }
  } else {
    sendResponse(res, "Invalid response. Please reply with 'yes' or 'no'.");
  }
});

// Check if both approvals are received
app.get("/check-approval", (req, res) => {
  const approver1 = approvals["+64274476221"];
  const approver2 = approvals["+64273814842"];

  if (approver1 && approver2) {
    // Both approvals received
    res.json({ approved: true, rejected: false });
  } else if (approver1 === false || approver2 === false) {
    // Rejection received from one or both approvers
    res.json({ approved: false, rejected: true });
  } else {
    // Still waiting for responses
    res.json({ approved: false, rejected: false });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
