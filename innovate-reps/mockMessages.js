/** Mock help-desk SMS inbox for the Messages app (full text, no truncation). */

export const MOCK_HELP_MESSAGES = [
  {
    id: "mock-1",
    sender: "Ama Mensah",
    number: "024 555 0192",
    time: "09:32",
    text: "Someone called saying they're from MTN and asked for my PIN, please help.",
  },
  {
    id: "mock-2",
    sender: "Kofi Mensah",
    number: "024 312 8870",
    time: "08:58",
    text: "My sister sent GH₵300 to a number she does not know. Can you check the number 024 000 0007?",
  },
  {
    id: "mock-3",
    sender: "Efua Owusu",
    number: "020 444 8811",
    time: "Yesterday",
    text: "I received a message that says I won a prize and must pay GH₵50 first. Is this real?",
  },
  {
    id: "mock-4",
    sender: "Unknown",
    number: "020 000 0000",
    time: "Tue",
    text: "Please call me back. A man said he will block my wallet if I don't send my code.",
  },
];

export const MOCK_THREAD_EXTRA = {
  "mock-1": [
    "Someone called saying they're from MTN and asked for my PIN, please help. I did not give it to them, but they keep calling from this number.",
    "Please check if other people have reported this number. They said my wallet will be blocked today.",
  ],
  "mock-1-rep-reply":
    "Thank you. Never share your PIN or code — MTN will not ask for it. I am checking the number now and will note the reports in Walo.",
};